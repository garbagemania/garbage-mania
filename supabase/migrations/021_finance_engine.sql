-- 021_finance_engine.sql
--
-- NOT yet executed against a database - run `supabase db reset` and
-- `supabase test db` (supabase/tests/finance_engine.sql) before relying on it.
--
-- Builds the write side of the finance module on top of the existing 006/007
-- schema WITHOUT replacing it. All money moves through SECURITY DEFINER
-- functions that check the caller's role and run in one transaction; the
-- direct INSERT/UPDATE/DELETE RLS policies on finance tables are removed so a
-- finance user can no longer forge ledger rows, flip a payment to confirmed,
-- or edit an invoice total through the API.
--
-- DESIGN DECISIONS (all additive):
--  * The existing ledger had no account dimension, and every financial
--    transaction must balance to zero, so "debits - credits" for a customer
--    was always 0. ledger_entries.ledger_account fixes that: a customer's
--    balance is the sum of their 'receivable' entries. Invoice issue:
--    Dr receivable / Cr revenue / Cr vat_payable. Payment: Dr cash_clearing /
--    Cr receivable. Existing rows (none expected) default to 'receivable'.
--  * Existing enum values are the source of truth; UI labels map onto them:
--      invoice  void           = Cancelled
--      payment  pending        = Pending verification
--               confirmed      = Verified
--               failed         = Rejected
--               reversed       = Cancelled/reversed
--      cheque   pending_clearance / cleared / bounced
--  * Overdue is DERIVED (invoice_balances.is_overdue), not stored, because the
--    existing transition rules do not allow partially_paid -> overdue.
--  * A fully credit-noted invoice becomes 'paid' (there is no 'credited'
--    status in the enum).
--  * VAT rates are never hardcoded: per line, defaulting to
--    finance_settings.default_vat_rate_bp when an admin has set one (else 0).
--  * Invoice numbers come from a sequence (gaps possible if a draft is
--    discarded). Numbers are immutable.

-- ---------------------------------------------------------------------
-- 0. Enum values
-- ---------------------------------------------------------------------
alter type public.financial_transaction_type add value if not exists 'credit_note';
alter type public.financial_transaction_type add value if not exists 'invoice_cancelled';

-- ---------------------------------------------------------------------
-- 1. Generic immutability helpers
-- ---------------------------------------------------------------------
create or replace function public.reject_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows cannot be deleted (table: %, id: %)', tg_table_name, tg_table_name, old.id
    using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Numbering
-- ---------------------------------------------------------------------
create sequence if not exists public.invoice_number_seq;
create sequence if not exists public.credit_note_number_seq;
create sequence if not exists public.adjustment_number_seq;
create sequence if not exists public.payment_reference_seq;
create sequence if not exists public.receipt_number_seq;

create or replace function public.new_document_number(p_prefix text, p_seq regclass)
returns text
language sql
volatile
as $$
  select p_prefix || '-' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY') || '-'
         || lpad(nextval(p_seq)::text, 6, '0');
$$;

create or replace function public.new_invoice_number()     returns text language sql volatile as $$ select public.new_document_number('INV', 'public.invoice_number_seq'); $$;
create or replace function public.new_credit_note_number() returns text language sql volatile as $$ select public.new_document_number('CN',  'public.credit_note_number_seq'); $$;
create or replace function public.new_adjustment_number()  returns text language sql volatile as $$ select public.new_document_number('ADJ', 'public.adjustment_number_seq'); $$;
create or replace function public.new_payment_reference()  returns text language sql volatile as $$ select public.new_document_number('PAY', 'public.payment_reference_seq'); $$;
create or replace function public.new_receipt_number()     returns text language sql volatile as $$ select public.new_document_number('RCT', 'public.receipt_number_seq'); $$;

-- ---------------------------------------------------------------------
-- 3. Finance settings (configurable business rules)
-- ---------------------------------------------------------------------
create table public.finance_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  value       text not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

comment on table public.finance_settings is
  'Configurable finance rules. Known keys: default_vat_rate_bp (basis points, '
  '1600 = 16%), default_payment_terms_days, require_separate_verifier '
  '(true/false). Empty by default - nothing is assumed. Written only through '
  'set_finance_setting() (super_admin).';

alter table public.finance_settings enable row level security;
alter table public.finance_settings force row level security;

create policy finance_settings_select
on public.finance_settings for select to authenticated
using (public.user_role() in ('super_admin', 'admin', 'finance'));

create trigger audit_finance_settings
  after insert or update or delete on public.finance_settings
  for each row execute function public.log_audit_event();

create or replace function public.get_finance_setting(p_key text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select value from public.finance_settings where key = p_key;
$$;

create or replace function public.set_finance_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(public.user_role(), '') <> 'super_admin' then
    raise exception 'Only a super admin can change finance settings' using errcode = '42501';
  end if;
  if p_key not in ('default_vat_rate_bp', 'default_payment_terms_days', 'require_separate_verifier') then
    raise exception 'Unknown finance setting %', p_key;
  end if;
  if p_key = 'default_vat_rate_bp' and (p_value !~ '^[0-9]{1,5}$' or p_value::int > 10000) then
    raise exception 'default_vat_rate_bp must be an integer between 0 and 10000';
  end if;
  if p_key = 'default_payment_terms_days' and (p_value !~ '^[0-9]{1,3}$') then
    raise exception 'default_payment_terms_days must be a whole number of days';
  end if;
  if p_key = 'require_separate_verifier' and p_value not in ('true', 'false') then
    raise exception 'require_separate_verifier must be true or false';
  end if;

  insert into public.finance_settings (key, value, updated_by)
  values (p_key, p_value, auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Ledger: account dimension + append-only guarantees
-- ---------------------------------------------------------------------
alter table public.ledger_entries
  add column ledger_account text not null default 'receivable'
    check (ledger_account in ('receivable', 'revenue', 'vat_payable', 'cash_clearing'));

create index ledger_entries_customer_account_idx
  on public.ledger_entries (customer_id, ledger_account, created_at);

create trigger reject_delete before delete on public.ledger_entries
  for each row execute function public.reject_delete();
create trigger reject_delete before delete on public.financial_transactions
  for each row execute function public.reject_delete();
create trigger reject_delete before delete on public.payment_allocations
  for each row execute function public.reject_delete();
create trigger reject_delete before delete on public.receipts
  for each row execute function public.reject_delete();
create trigger reject_delete before delete on public.payments
  for each row execute function public.reject_delete();

-- A given invoice issue / payment / refund may be posted to the ledger once.
-- (Only values that existed before this migration may appear in the predicate.)
create unique index financial_transactions_post_once_idx
  on public.financial_transactions (transaction_type, reference_table, reference_id)
  where transaction_type in ('invoice_issued', 'payment_received', 'refund_issued');

-- ---------------------------------------------------------------------
-- 5. Invoices
-- ---------------------------------------------------------------------
alter table public.invoices
  add column billing_period_start date,
  add column billing_period_end   date,
  add column notes                text,
  add column created_by           uuid references public.profiles (id) on delete set null,
  add column issued_by            uuid references public.profiles (id) on delete set null,
  add column issued_at            timestamptz,
  add column cancelled_by         uuid references public.profiles (id) on delete set null,
  add column cancelled_at         timestamptz,
  add constraint invoices_billing_period_check
    check (billing_period_start is null or billing_period_end is null or billing_period_end >= billing_period_start),
  add constraint invoices_currency_format check (currency ~ '^[A-Z]{3}$');

alter table public.invoices alter column invoice_number set default public.new_invoice_number();

create or replace function public.guard_invoice_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_number is distinct from old.invoice_number then
    raise exception 'Invoice numbers are immutable' using errcode = '23514';
  end if;
  if new.customer_id is distinct from old.customer_id then
    raise exception 'An invoice cannot be moved to another customer' using errcode = '23514';
  end if;
  if old.status <> 'draft' and (
       new.subtotal_cents is distinct from old.subtotal_cents
    or new.tax_cents      is distinct from old.tax_cents
    or new.total_cents    is distinct from old.total_cents
    or new.currency       is distinct from old.currency
  ) then
    raise exception 'Amounts on an issued invoice are immutable; use a credit note' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_invoice_immutable_fields
  before update on public.invoices
  for each row execute function public.guard_invoice_immutable_fields();

create or replace function public.guard_invoice_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft invoices can be discarded (invoice % is %)', old.invoice_number, old.status
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger guard_invoice_delete
  before delete on public.invoices
  for each row execute function public.guard_invoice_delete();

-- ---------------------------------------------------------------------
-- 6. Invoice items: VAT breakdown
-- ---------------------------------------------------------------------
alter table public.invoice_items
  add column service_plan_id uuid references public.service_plans (id) on delete restrict,
  add column vat_rate_bp     integer not null default 0 check (vat_rate_bp between 0 and 10000),
  add column vat_cents       bigint  not null default 0 check (vat_cents >= 0),
  add column line_total_cents bigint;

update public.invoice_items set line_total_cents = amount_cents + vat_cents where line_total_cents is null;

alter table public.invoice_items
  alter column line_total_cents set not null,
  add constraint invoice_items_vat_check
    check (vat_cents = (amount_cents * vat_rate_bp + 5000) / 10000),
  add constraint invoice_items_total_check
    check (line_total_cents = amount_cents + vat_cents);

-- Existing guard covers UPDATE/DELETE; this covers INSERT.
create or replace function public.guard_invoice_items_insert()
returns trigger
language plpgsql
as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices where id = new.invoice_id;
  if v_status is distinct from 'draft' then
    raise exception 'Items can only be added to a draft invoice (invoice is %)', v_status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_invoice_items_insert
  before insert on public.invoice_items
  for each row execute function public.guard_invoice_items_insert();

-- ---------------------------------------------------------------------
-- 7. Payments / cheques
-- ---------------------------------------------------------------------
alter table public.payments
  add column internal_reference  text unique default public.new_payment_reference(),
  add column notes               text,
  add column created_by          uuid references public.profiles (id) on delete set null,
  add column verified_by         uuid references public.profiles (id) on delete set null,
  add column verified_at         timestamptz,
  add column verification_notes  text,
  add column document_id         uuid references public.documents (id) on delete set null,
  add constraint payments_currency_format check (currency ~ '^[A-Z]{3}$');

-- The same external reference (e.g. an M-Pesa receipt) cannot be recorded twice
-- while a payment is live; a rejected payment frees the reference.
create unique index payments_method_reference_live_uidx
  on public.payments (payment_method, reference)
  where reference is not null and status in ('pending', 'confirmed');

create or replace function public.guard_payment_update()
returns trigger
language plpgsql
as $$
begin
  if new.customer_id    is distinct from old.customer_id
  or new.amount_cents   is distinct from old.amount_cents
  or new.payment_method is distinct from old.payment_method
  or new.currency       is distinct from old.currency
  or new.received_at    is distinct from old.received_at then
    raise exception 'Core payment fields are immutable; reverse and re-record instead' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'pending'   and new.status in ('confirmed', 'failed'))
      or (old.status = 'confirmed' and new.status = 'reversed')
    ) then
      raise exception 'Illegal payment status transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_payment_update
  before update on public.payments
  for each row execute function public.guard_payment_update();

alter table public.cheque_payments
  alter column deposited_date drop not null,
  add column cheque_date   date,
  add column received_date date;

comment on column public.cheque_payments.deposited_date is
  'Nullable: a cheque is recorded when received, before it is deposited.';

-- ---------------------------------------------------------------------
-- 8. Credit notes, debit adjustments
-- ---------------------------------------------------------------------
create table public.credit_notes (
  id                 uuid primary key default gen_random_uuid(),
  credit_note_number text not null unique default public.new_credit_note_number(),
  customer_id        uuid not null references public.customers (id) on delete restrict,
  invoice_id         uuid references public.invoices (id) on delete restrict,
  reason             text not null check (length(trim(reason)) > 0),
  subtotal_cents     bigint not null check (subtotal_cents > 0),
  vat_rate_bp        integer not null default 0 check (vat_rate_bp between 0 and 10000),
  tax_cents          bigint not null default 0 check (tax_cents >= 0),
  total_cents        bigint not null,
  currency           char(3) not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  check (tax_cents = (subtotal_cents * vat_rate_bp + 5000) / 10000),
  check (total_cents = subtotal_cents + tax_cents)
);
create index credit_notes_customer_id_idx on public.credit_notes (customer_id);
create index credit_notes_invoice_id_idx on public.credit_notes (invoice_id);

create table public.finance_adjustments (
  id                 uuid primary key default gen_random_uuid(),
  adjustment_number  text not null unique default public.new_adjustment_number(),
  customer_id        uuid not null references public.customers (id) on delete restrict,
  amount_cents       bigint not null check (amount_cents > 0),
  currency           char(3) not null default 'KES' check (currency ~ '^[A-Z]{3}$'),
  reason             text not null check (length(trim(reason)) > 0),
  reference          text,
  notes              text,
  document_id        uuid references public.documents (id) on delete set null,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index finance_adjustments_customer_id_idx on public.finance_adjustments (customer_id);

do $$
declare t text;
begin
  foreach t in array array['credit_notes', 'finance_adjustments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create trigger reject_update before update on public.%I for each row execute function public.reject_update()', t);
    execute format('create trigger reject_delete before delete on public.%I for each row execute function public.reject_delete()', t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.log_audit_event()', t, t);
  end loop;
end $$;

create policy credit_notes_select_staff
on public.credit_notes for select to authenticated
using (public.user_role() in ('super_admin', 'admin', 'finance'));

create policy credit_notes_select_own
on public.credit_notes for select to authenticated
using (public.user_role() = 'customer' and customer_id = public.customer_id());

create policy finance_adjustments_select_staff
on public.finance_adjustments for select to authenticated
using (public.user_role() in ('super_admin', 'admin', 'finance'));

-- Validator: also recognise the new reference tables.
create or replace function public.validate_financial_transaction_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference_table = 'invoices' then
    if not exists (select 1 from public.invoices where id = new.reference_id) then
      raise exception 'financial_transactions.reference_id % not found in invoices', new.reference_id;
    end if;
  elsif new.reference_table = 'payments' then
    if not exists (select 1 from public.payments where id = new.reference_id) then
      raise exception 'financial_transactions.reference_id % not found in payments', new.reference_id;
    end if;
  elsif new.reference_table = 'refund_payouts' then
    if not exists (select 1 from public.refund_payouts where id = new.reference_id) then
      raise exception 'financial_transactions.reference_id % not found in refund_payouts', new.reference_id;
    end if;
  elsif new.reference_table = 'credit_notes' then
    if not exists (select 1 from public.credit_notes where id = new.reference_id) then
      raise exception 'financial_transactions.reference_id % not found in credit_notes', new.reference_id;
    end if;
  elsif new.reference_table = 'finance_adjustments' then
    if not exists (select 1 from public.finance_adjustments where id = new.reference_id) then
      raise exception 'financial_transactions.reference_id % not found in finance_adjustments', new.reference_id;
    end if;
  else
    raise exception 'financial_transactions.reference_table % is not a recognized reference type', new.reference_table;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Refunds: request -> approve -> complete (ledger posts on completion)
-- ---------------------------------------------------------------------
alter table public.refund_payouts
  alter column financial_transaction_id drop not null,
  add column payment_id   uuid references public.payments (id) on delete restrict,
  add column reason       text,
  add column approved_by  uuid references public.profiles (id) on delete set null,
  add column approved_at  timestamptz;

create index refund_payouts_payment_id_idx on public.refund_payouts (payment_id);

-- ---------------------------------------------------------------------
-- 10. Allocation + invoice status rules (credit-note aware)
-- ---------------------------------------------------------------------
create or replace function public.validate_payment_allocation()
returns trigger
language plpgsql
as $$
declare
  v_pay        record;
  v_inv        record;
  v_alloc_pay  bigint;
  v_alloc_inv  bigint;
  v_credited   bigint;
begin
  select customer_id, amount_cents, status into v_pay
  from public.payments where id = new.payment_id for update;

  if v_pay.status is distinct from 'confirmed' then
    raise exception 'Only verified payments can be allocated (payment % is %)', new.payment_id, v_pay.status;
  end if;

  select customer_id, total_cents, status into v_inv
  from public.invoices where id = new.invoice_id for update;

  if v_inv.customer_id is distinct from v_pay.customer_id then
    raise exception 'Payment and invoice belong to different customers';
  end if;
  if v_inv.status in ('draft', 'void') then
    raise exception 'Cannot allocate a payment to a % invoice', v_inv.status;
  end if;

  select coalesce(sum(amount_cents), 0) into v_alloc_pay
  from public.payment_allocations where payment_id = new.payment_id;
  if v_alloc_pay + new.amount_cents > v_pay.amount_cents then
    raise exception 'Allocation of % exceeds payment % remaining balance (allocated so far: %, payment total: %)',
      new.amount_cents, new.payment_id, v_alloc_pay, v_pay.amount_cents;
  end if;

  select coalesce(sum(amount_cents), 0) into v_alloc_inv
  from public.payment_allocations where invoice_id = new.invoice_id;
  select coalesce(sum(total_cents), 0) into v_credited
  from public.credit_notes where invoice_id = new.invoice_id;
  if v_alloc_inv + v_credited + new.amount_cents > v_inv.total_cents then
    raise exception 'Allocation of % exceeds invoice % outstanding balance (allocated: %, credited: %, invoice total: %)',
      new.amount_cents, new.invoice_id, v_alloc_inv, v_credited, v_inv.total_cents;
  end if;

  return new;
end;
$$;

create or replace function public.refresh_invoice_status(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_status  public.invoice_status;
  v_total   bigint;
  v_settled bigint;
begin
  select status, total_cents into v_status, v_total
  from public.invoices where id = p_invoice_id for update;

  if v_status is null or v_status in ('draft', 'void') then
    return;
  end if;

  select coalesce((select sum(amount_cents) from public.payment_allocations where invoice_id = p_invoice_id), 0)
       + coalesce((select sum(total_cents)  from public.credit_notes         where invoice_id = p_invoice_id), 0)
  into v_settled;

  if v_settled >= v_total then
    update public.invoices set status = 'paid' where id = p_invoice_id and status <> 'paid';
  elsif v_settled > 0 then
    update public.invoices set status = 'partially_paid'
    where id = p_invoice_id and status not in ('partially_paid', 'paid');
  end if;
end;
$$;

create or replace function public.recompute_invoice_status()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_invoice_status(new.invoice_id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 11. Views (security_invoker: the caller's RLS applies)
-- ---------------------------------------------------------------------
create or replace view public.invoice_balances with (security_invoker = true) as
select
  b.*,
  (b.status in ('issued', 'partially_paid', 'overdue')
     and b.due_date < (now() at time zone 'Africa/Nairobi')::date
     and b.outstanding_cents > 0) as is_overdue,
  case
    when b.status in ('issued', 'partially_paid', 'overdue')
     and b.due_date < (now() at time zone 'Africa/Nairobi')::date
     and b.outstanding_cents > 0
    then (now() at time zone 'Africa/Nairobi')::date - b.due_date
    else 0
  end as days_overdue
from (
  select
    i.id as invoice_id, i.customer_id, i.invoice_number, i.status,
    i.issue_date, i.due_date, i.currency,
    i.subtotal_cents, i.tax_cents, i.total_cents,
    coalesce(a.paid_cents, 0)::bigint     as paid_cents,
    coalesce(c.credited_cents, 0)::bigint as credited_cents,
    greatest(i.total_cents - coalesce(a.paid_cents, 0) - coalesce(c.credited_cents, 0), 0)::bigint as outstanding_cents
  from public.invoices i
  left join (select invoice_id, sum(amount_cents) as paid_cents
             from public.payment_allocations group by invoice_id) a on a.invoice_id = i.id
  left join (select invoice_id, sum(total_cents) as credited_cents
             from public.credit_notes where invoice_id is not null group by invoice_id) c on c.invoice_id = i.id
) b;

create or replace view public.payment_allocation_status with (security_invoker = true) as
select
  p.id as payment_id, p.customer_id, p.payment_method, p.status, p.amount_cents, p.currency,
  coalesce(sum(pa.amount_cents), 0)::bigint as allocated_cents,
  (p.amount_cents - coalesce(sum(pa.amount_cents), 0))::bigint as unallocated_cents,
  case
    when coalesce(sum(pa.amount_cents), 0) = 0 then 'unallocated'
    when coalesce(sum(pa.amount_cents), 0) >= p.amount_cents then 'fully_allocated'
    else 'partially_allocated'
  end as allocation_status
from public.payments p
left join public.payment_allocations pa on pa.payment_id = p.id
group by p.id;

create or replace view public.customer_balances with (security_invoker = true) as
select
  customer_id,
  sum(case entry_type when 'debit' then amount_cents else -amount_cents end)::bigint as balance_cents,
  sum(case entry_type when 'debit' then amount_cents else 0 end)::bigint  as total_debits_cents,
  sum(case entry_type when 'credit' then amount_cents else 0 end)::bigint as total_credits_cents
from public.ledger_entries
where ledger_account = 'receivable'
group by customer_id;

grant select on public.invoice_balances, public.payment_allocation_status, public.customer_balances to authenticated;

-- ---------------------------------------------------------------------
-- 12. Write functions
-- ---------------------------------------------------------------------
create or replace function public.require_finance_writer()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(public.user_role(), '') not in ('super_admin', 'finance') then
    raise exception 'Finance permission required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- Ledger helpers -------------------------------------------------------
create or replace function public.post_payment_ledger(p_payment_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay record;
  v_tx  uuid;
  v_ref text;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  v_ref := coalesce(v_pay.reference, v_pay.internal_reference);

  insert into public.financial_transactions
    (customer_id, transaction_type, reference_table, reference_id, amount_cents, currency, created_by)
  values
    (v_pay.customer_id, 'payment_received', 'payments', v_pay.id, v_pay.amount_cents, v_pay.currency, p_actor)
  returning id into v_tx;

  insert into public.ledger_entries
    (customer_id, financial_transaction_id, entry_type, amount_cents, currency, description, ledger_account)
  values
    (v_pay.customer_id, v_tx, 'debit',  v_pay.amount_cents, v_pay.currency, 'Payment received ' || v_ref, 'cash_clearing'),
    (v_pay.customer_id, v_tx, 'credit', v_pay.amount_cents, v_pay.currency, 'Payment ' || v_ref,          'receivable');

  insert into public.receipts (payment_id, receipt_number)
  values (v_pay.id, public.new_receipt_number());
end;
$$;

-- Invoices -------------------------------------------------------------
create or replace function public.create_invoice(
  p_customer_id  uuid,
  p_issue_date   date,
  p_due_date     date,
  p_period_start date,
  p_period_end   date,
  p_notes        text,
  p_items        jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := public.require_finance_writer();
  v_default_bp integer := coalesce(nullif(public.get_finance_setting('default_vat_rate_bp'), '')::int, 0);
  v_invoice   uuid;
  v_item      jsonb;
  v_desc      text;
  v_qty       numeric(10, 2);
  v_price     bigint;
  v_bp        integer;
  v_amount    bigint;
  v_vat       bigint;
  v_sub       bigint := 0;
  v_tax       bigint := 0;
  v_lines     jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.status::text = 'active' and c.approval_status = 'approved'
  ) then
    raise exception 'Customer not found, not active, or not approved';
  end if;

  if p_issue_date is null or p_due_date is null or p_due_date < p_issue_date then
    raise exception 'A valid issue date and a due date on or after it are required';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An invoice needs at least one line item';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'An invoice cannot have more than 100 lines';
  end if;

  -- Pass 1: validate + compute (authoritative; the browser's numbers are never used).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_desc := nullif(trim(v_item ->> 'description'), '');
    if v_desc is null then raise exception 'Every line needs a description'; end if;

    if coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' or (v_item ->> 'quantity')::numeric <= 0 then
      raise exception 'Invalid quantity on line "%"', v_desc;
    end if;
    if coalesce(v_item ->> 'unit_price_cents', '') !~ '^[0-9]{1,12}$' then
      raise exception 'Invalid unit price on line "%"', v_desc;
    end if;

    v_qty    := (v_item ->> 'quantity')::numeric(10, 2);
    v_price  := (v_item ->> 'unit_price_cents')::bigint;
    v_bp     := coalesce(nullif(v_item ->> 'vat_rate_bp', '')::int, v_default_bp);
    if v_bp < 0 or v_bp > 10000 then raise exception 'Invalid VAT rate on line "%"', v_desc; end if;

    v_amount := round(v_qty * v_price)::bigint;
    v_vat    := (v_amount * v_bp + 5000) / 10000;
    v_sub    := v_sub + v_amount;
    v_tax    := v_tax + v_vat;

    v_lines := v_lines || jsonb_build_object(
      'description', v_desc, 'quantity', v_qty, 'unit_price_cents', v_price,
      'vat_rate_bp', v_bp, 'amount_cents', v_amount, 'vat_cents', v_vat,
      'service_plan_id', nullif(v_item ->> 'service_plan_id', ''));
  end loop;

  if v_sub + v_tax <= 0 then
    raise exception 'An invoice total must be greater than zero';
  end if;

  insert into public.invoices
    (customer_id, issue_date, due_date, status, subtotal_cents, tax_cents, total_cents,
     billing_period_start, billing_period_end, notes, created_by)
  values
    (p_customer_id, p_issue_date, p_due_date, 'draft', v_sub, v_tax, v_sub + v_tax,
     p_period_start, p_period_end, nullif(trim(coalesce(p_notes, '')), ''), v_uid)
  returning id into v_invoice;

  for v_item in select * from jsonb_array_elements(v_lines) loop
    insert into public.invoice_items
      (invoice_id, service_plan_id, description, quantity, unit_price_cents, amount_cents,
       vat_rate_bp, vat_cents, line_total_cents)
    values
      (v_invoice, nullif(v_item ->> 'service_plan_id', '')::uuid, v_item ->> 'description',
       (v_item ->> 'quantity')::numeric(10, 2), (v_item ->> 'unit_price_cents')::bigint,
       (v_item ->> 'amount_cents')::bigint, (v_item ->> 'vat_rate_bp')::int,
       (v_item ->> 'vat_cents')::bigint,
       (v_item ->> 'amount_cents')::bigint + (v_item ->> 'vat_cents')::bigint);
  end loop;

  return v_invoice;
end;
$$;

create or replace function public.discard_draft_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.invoice_status;
begin
  perform public.require_finance_writer();
  select status into v_status from public.invoices where id = p_invoice_id for update;
  if v_status is null then raise exception 'Invoice not found'; end if;
  if v_status <> 'draft' then
    raise exception 'Only draft invoices can be discarded; cancel or credit an issued invoice' using errcode = '42501';
  end if;
  delete from public.invoice_items where invoice_id = p_invoice_id;
  delete from public.invoices where id = p_invoice_id;
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := public.require_finance_writer();
  v_inv  record;
  v_sum  record;
  v_tx   uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_inv.status <> 'draft' then
    raise exception 'Only a draft invoice can be issued (invoice % is %)', v_inv.invoice_number, v_inv.status;
  end if;
  if not exists (select 1 from public.customers where id = v_inv.customer_id and approval_status = 'approved') then
    raise exception 'The customer is not approved';
  end if;

  select coalesce(sum(amount_cents), 0) as sub, coalesce(sum(vat_cents), 0) as tax, count(*) as n
  into v_sum from public.invoice_items where invoice_id = p_invoice_id;
  if v_sum.n = 0 or v_sum.sub <> v_inv.subtotal_cents or v_sum.tax <> v_inv.tax_cents then
    raise exception 'Invoice lines do not match the invoice totals; recreate the draft';
  end if;

  update public.invoices
  set status = 'issued', issued_by = v_uid, issued_at = now()
  where id = p_invoice_id;

  insert into public.financial_transactions
    (customer_id, transaction_type, reference_table, reference_id, amount_cents, currency, created_by)
  values
    (v_inv.customer_id, 'invoice_issued', 'invoices', v_inv.id, v_inv.total_cents, v_inv.currency, v_uid)
  returning id into v_tx;

  insert into public.ledger_entries
    (customer_id, financial_transaction_id, entry_type, amount_cents, currency, description, ledger_account)
  values
    (v_inv.customer_id, v_tx, 'debit', v_inv.total_cents, v_inv.currency, 'Invoice ' || v_inv.invoice_number, 'receivable'),
    (v_inv.customer_id, v_tx, 'credit', v_inv.subtotal_cents, v_inv.currency, 'Invoice ' || v_inv.invoice_number || ' revenue', 'revenue');

  if v_inv.tax_cents > 0 then
    insert into public.ledger_entries
      (customer_id, financial_transaction_id, entry_type, amount_cents, currency, description, ledger_account)
    values
      (v_inv.customer_id, v_tx, 'credit', v_inv.tax_cents, v_inv.currency, 'Invoice ' || v_inv.invoice_number || ' VAT', 'vat_payable');
  end if;
end;
$$;

create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.require_finance_writer();
  v_inv record;
  v_tx  uuid;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to cancel an invoice';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_inv.status not in ('issued', 'overdue') then
    raise exception 'Only an issued invoice with no payments can be cancelled (invoice is %)', v_inv.status;
  end if;
  if exists (select 1 from public.payment_allocations where invoice_id = p_invoice_id)
     or exists (select 1 from public.credit_notes where invoice_id = p_invoice_id) then
    raise exception 'This invoice has payments or credit notes against it; use a credit note instead';
  end if;

  update public.invoices
  set status = 'void', voided_reason = trim(p_reason), cancelled_by = v_uid, cancelled_at = now()
  where id = p_invoice_id;

  insert into public.financial_transactions
    (customer_id, transaction_type, reference_table, reference_id, amount_cents, currency, notes, created_by)
  values
    (v_inv.customer_id, 'invoice_cancelled', 'invoices', v_inv.id, v_inv.total_cents, v_inv.currency, trim(p_reason), v_uid)
  returning id into v_tx;

  insert into public.ledger_entries
    (customer_id, financial_transaction_id, entry_type, amount_cents, currency, description, ledger_account)
  values
    (v_inv.customer_id, v_tx, 'credit', v_inv.total_cents, v_inv.currency, 'Reversal: invoice ' || v_inv.invoice_number || ' cancelled', 'receivable'),
    (v_inv.customer_id, v_tx, 'debit',  v_inv.subtotal_cents, v_inv.currency, 'Reversal: invoice ' || v_inv.invoice_number || ' revenue', 'revenue');

  if v_inv.tax_cents > 0 then
    insert into public.ledger_entries
      (customer_id, financial_transaction_id, entry_type, amount_cents, currency, description, ledger_account)
    values
      (v_inv.customer_id, v_tx, 'debit', v_inv.tax_cents, v_inv.currency, 'Reversal: invoice ' || v_inv.invoice_number || ' VAT', 'vat_payable');
  end if;
end;
$$;

-- Payments -------------------------------------------------------------
create or replace function public.record_payment(
  p_customer_id  uuid,
  p_method       public.payment_method,
  p_amount_cents bigint,
  p_received_at  timestamptz,
  p_reference    text default null,
  p_notes        text default null,
  p_document_id  uuid default null,
  p_cheque       jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := public.require_finance_writer();
  v_payment uuid;
  v_ref     text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Customer not found';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 1000000000000 then
    raise exception 'Invalid payment amount';
  end if;
  if p_received_at is null then raise exception 'A received date is required'; end if;

  if p_document_id is not null and not exists (
    select 1 from public.documents where id = p_document_id and uploaded_by = v_uid
  ) then
    raise exception 'Supporting document not found';
  end if;

  if p_method = 'cheque' then
    if p_cheque is null
       or nullif(trim(p_cheque ->> 'cheque_number'), '') is null
       or nullif(trim(p_cheque ->> 'bank_name'), '') is null then
      raise exception 'Cheque number and bank are required for a cheque payment';
    end if;
    v_ref := coalesce(v_ref, trim(p_cheque ->> 'cheque_number'));
  elsif p_cheque is not null then
    raise exception 'Cheque details are only valid for cheque payments';
  end if;

  if p_method in ('mpesa', 'bank_transfer') and v_ref is null then
    raise exception 'An external reference is required for % payments', p_method;
  end if;

  insert into public.payments
    (customer_id, payment_method, amount_cents, status, received_at, reference, notes, created_by, document_id)
  values
    (p_customer_id, p_method, p_amount_cents, 'pending', p_received_at, v_ref,
     nullif(trim(coalesce(p_notes, '')), ''), v_uid, p_document_id)
  returning id into v_payment;

  if p_method = 'cheque' then
    insert into public.cheque_payments
      (payment_id, cheque_number, bank_name, cheque_date, received_date, status)
    values
      (v_payment, trim(p_cheque ->> 'cheque_number'), trim(p_cheque ->> 'bank_name'),
       nullif(p_cheque ->> 'cheque_date', '')::date,
       coalesce(nullif(p_cheque ->> 'received_date', '')::date, (p_received_at at time zone 'Africa/Nairobi')::date),
       'pending_clearance');
  end if;

  return v_payment;
end;
$$;

create or replace function public.verify_payment(p_payment_id uuid, p_approve boolean, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := public.require_finance_writer();
  v_pay   record;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.status <> 'pending' then
    raise exception 'Payment is already % and cannot be verified again', v_pay.status;
  end if;

  if public.get_finance_setting('require_separate_verifier') = 'true' and v_pay.created_by = v_uid then
    raise exception 'A different finance user must verify this payment' using errcode = '42501';
  end if;

  if not p_approve then
    if v_notes is null then raise exception 'A reason is required to reject a payment'; end if;
    update public.payments
    set status = 'failed', verified_by = v_uid, verified_at = now(), verification_notes = v_notes
    where id = p_payment_id;
    update public.cheque_payments set status = 'bounced' where payment_id = p_payment_id;
    return;
  end if;

  update public.payments
  set status = 'confirmed', verified_by = v_uid, verified_at = now(), verification_notes = v_notes
  where id = p_payment_id;
  update public.cheque_payments
  set status = 'cleared', cleared_date = (now() at time zone 'Africa/Nairobi')::date
  where payment_id = p_payment_id;

  perform public.post_payment_ledger(p_payment_id, v_uid);
end;
$$;

create or replace function public.allocate_payment(p_payment_id uuid, p_invoice_id uuid, p_amount_cents bigint)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.require_finance_writer();
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Invalid allocation amount'; end if;
  -- validate_payment_allocation (status, customer, over-allocation) and
  -- recompute_invoice_status run as triggers on this insert.
  insert into public.payment_allocations (payment_id, invoice_id, amount_cents)
  values (p_payment_id, p_invoice_id, p_amount_cents)
  returning id into v_id;
  return v_id;
end;
$$;

-- Credit notes / debit adjustments --------------------------------------
create or replace function public.issue_credit_note(
  p_invoice_id     uuid,
  p_customer_id    uuid,
  p_subtotal_cents bigint,
  p_vat_rate_bp    integer,
  p_reason         text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := public.require_finance_writer();
  v_inv      record;
  v_customer uuid := p_customer_id;
  v_bp       integer := coalesce(p_vat_rate_bp, 0);
  v_tax      bigint;
  v_total    bigint;
  v_credited bigint;
  v_cn       uuid;
  v_tx       uuid;
  v_currency char(3) := 'KES';
  v_num      text;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required'; end if;
  if p_subtotal_cents is null or p_subtotal_cents <= 0 then raise exception 'Invalid credit note amount'; end if;
  if v_bp < 0 or v_bp > 10000 then raise exception 'Invalid VAT rate'; end if;

  if p_invoice_id is not null then
    select * into v_inv from public.invoices where id = p_invoice_id for update;
    if not found then raise exception 'Invoice not found'; end if;
    if v_inv.status in ('draft', 'void') then
      raise exception 'Cannot credit a % invoice', v_inv.status;
    end if;
    v_customer := v_inv.customer_id;
    v_currency := v_inv.currency;
  elsif v_customer is null or not exists (select 1 from public.customers where id = v_customer) then
    raise exception 'A customer or an invoice is required';
  end if;

  v_tax := (p_subtotal_cents * v_bp + 5000) / 10000;
  v_total := p_subtotal_cents + v_tax;

  if p_invoice_id is not null then
    select coalesce(sum(total_cents), 0) into v_credited from public.credit_notes where invoice_id = p_invoice_id;
    if v_credited + v_total > v_inv.total_cents then
      raise exception 'Credit notes would exceed the invoice total (already credited: %, invoice total: %)',
        v_credited, v_inv.total_cents;
    end if;
  end if;

  insert into public.credit_notes
    (customer_id, invoice_id, reason, subtotal_cents, vat_rate_bp, tax_cents, total_cents, currency, created_by)
  values
    (v_customer, p_invoice_id, trim(p_reason), p_subtotal_cents, v_bp, v_tax, v_total, v_currency, v_uid)
  returning id, credit_note_number into v_cn, v_num;

  insert into public.financial_transactions
    (customer_id, transaction_type, reference_table, reference_id, amount_cents, currency, notes, created_by)
  values
    (v_customer, 'credit_note', 'credit_notes', v_cn, v_total, v_currency, trim(p_reason), v_uid)
  returning id into v_tx;

  insert into public.ledger_entries
    (customer_id, financial_transaction_id, entry_type, amount_cents, currency, description, ledger_account)
  values
    (v_customer, v_tx, 'credit', v_total, v_currency, 'Credit note ' || v_num, 'receivable'),
    (v_customer, v_tx, 'debit',  p_subtotal_cents, v_currency, 'Credit note ' || v_num || ' revenue', 'revenue');

  if v_tax > 0 then
    insert into public.ledger_entries
      (customer_id, financial_transaction_id, entry_type, amount_cents, currency, description, ledger_account)
    values
      (v_customer, v_tx, 'debit', v_tax, v_currency, 'Credit note ' || v_num || ' VAT', 'vat_payable');
  end if;

  if p_invoice_id is not null then
    perform public.refresh_invoice_status(p_invoice_id);
  end if;

  return v_cn;
end;
$$;

create or replace function public.create_debit_adjustment(
  p_customer_id  uuid,
  p_amount_cents bigint,
  p_reason       text,
  p_reference    text default null,
  p_notes        text default null,
  p_document_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.require_finance_writer();
  v_id  uuid;
  v_num text;
  v_tx  uuid;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Invalid adjustment amount'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Customer not found';
  end if;
  if p_document_id is not null and not exists (
    select 1 from public.documents where id = p_document_id and uploaded_by = v_uid
  ) then
    raise exception 'Supporting document not found';
  end if;

  insert into public.finance_adjustments
    (customer_id, amount_cents, reason, reference, notes, document_id, created_by)
  values
    (p_customer_id, p_amount_cents, trim(p_reason), nullif(trim(coalesce(p_reference, '')), ''),
     nullif(trim(coalesce(p_notes, '')), ''), p_document_id, v_uid)
  returning id, adjustment_number into v_id, v_num;

  insert into public.financial_transactions
    (customer_id, transaction_type, reference_table, reference_id, amount_cents, notes, created_by)
  values
    (p_customer_id, 'adjustment', 'finance_adjustments', v_id, p_amount_cents, trim(p_reason), v_uid)
  returning id into v_tx;

  insert into public.ledger_entries
    (customer_id, financial_transaction_id, entry_type, amount_cents, description, ledger_account)
  values
    (p_customer_id, v_tx, 'debit',  p_amount_cents, 'Debit adjustment ' || v_num, 'receivable'),
    (p_customer_id, v_tx, 'credit', p_amount_cents, 'Debit adjustment ' || v_num, 'revenue');

  return v_id;
end;
$$;

-- Refunds ----------------------------------------------------------------
create or replace function public.request_refund(
  p_payment_id   uuid,
  p_amount_cents bigint,
  p_method       public.refund_payout_method,
  p_reason       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := public.require_finance_writer();
  v_pay       record;
  v_committed bigint;
  v_id        uuid;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Invalid refund amount'; end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_pay.status <> 'confirmed' then
    raise exception 'Only verified payments can be refunded (payment is %)', v_pay.status;
  end if;

  select coalesce(sum(amount_cents), 0) into v_committed
  from public.refund_payouts where payment_id = p_payment_id and status in ('pending', 'completed');

  if v_committed + p_amount_cents > v_pay.amount_cents then
    raise exception 'Refund exceeds the eligible amount (payment: %, already refunded or requested: %)',
      v_pay.amount_cents, v_committed;
  end if;

  insert into public.refund_payouts
    (customer_id, payment_id, payout_method, amount_cents, currency, status, reason, initiated_by)
  values
    (v_pay.customer_id, p_payment_id, p_method, p_amount_cents, v_pay.currency, 'pending', trim(p_reason), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.approve_refund(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.require_finance_writer();
  v_ref record;
begin
  select * into v_ref from public.refund_payouts where id = p_refund_id for update;
  if not found then raise exception 'Refund not found'; end if;
  if v_ref.status <> 'pending' or v_ref.approved_by is not null then
    raise exception 'Refund is not awaiting approval';
  end if;
  if v_ref.initiated_by = v_uid and public.user_role() <> 'super_admin' then
    raise exception 'A refund must be approved by someone other than the requester' using errcode = '42501';
  end if;
  update public.refund_payouts set approved_by = v_uid, approved_at = now() where id = p_refund_id;
end;
$$;

create or replace function public.reject_refund(p_refund_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref record;
begin
  perform public.require_finance_writer();
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required'; end if;
  select * into v_ref from public.refund_payouts where id = p_refund_id for update;
  if not found or v_ref.status <> 'pending' then raise exception 'Refund is not pending'; end if;
  update public.refund_payouts
  set status = 'failed', reason = v_ref.reason || ' | Rejected: ' || trim(p_reason)
  where id = p_refund_id;
end;
$$;

create or replace function public.complete_refund(p_refund_id uuid, p_external_reference text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.require_finance_writer();
  v_ref record;
  v_tx  uuid;
begin
  if nullif(trim(coalesce(p_external_reference, '')), '') is null then
    raise exception 'The payout reference is required to complete a refund';
  end if;

  select * into v_ref from public.refund_payouts where id = p_refund_id for update;
  if not found then raise exception 'Refund not found'; end if;
  if v_ref.status <> 'pending' or v_ref.approved_by is null then
    raise exception 'Refund must be approved and pending to complete';
  end if;

  insert into public.financial_transactions
    (customer_id, transaction_type, reference_table, reference_id, amount_cents, currency, created_by)
  values
    (v_ref.customer_id, 'refund_issued', 'refund_payouts', v_ref.id, v_ref.amount_cents, v_ref.currency, v_uid)
  returning id into v_tx;

  insert into public.ledger_entries
    (customer_id, financial_transaction_id, entry_type, amount_cents, currency, description, ledger_account)
  values
    (v_ref.customer_id, v_tx, 'debit',  v_ref.amount_cents, v_ref.currency, 'Refund paid ' || trim(p_external_reference), 'receivable'),
    (v_ref.customer_id, v_tx, 'credit', v_ref.amount_cents, v_ref.currency, 'Refund paid ' || trim(p_external_reference), 'cash_clearing');

  update public.refund_payouts
  set status = 'completed', external_reference = trim(p_external_reference),
      completed_at = now(), financial_transaction_id = v_tx
  where id = p_refund_id;
end;
$$;

-- M-Pesa: trusted, idempotent confirmation (service role only) ------------
create or replace function public.confirm_mpesa_payment(
  p_checkout_request_id  text,
  p_mpesa_receipt_number text,
  p_amount_cents         bigint,
  p_phone_number         text,
  p_transacted_at        timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent  record;
  v_existing uuid;
  v_payment uuid;
  v_outstanding bigint;
begin
  if nullif(trim(coalesce(p_mpesa_receipt_number, '')), '') is null then
    raise exception 'M-Pesa receipt number is required';
  end if;

  -- Idempotency: a repeated callback returns the payment already created.
  select payment_id into v_existing from public.mpesa_transactions
  where mpesa_receipt_number = p_mpesa_receipt_number;
  if found then return v_existing; end if;

  select * into v_intent from public.mpesa_payment_intents
  where checkout_request_id = p_checkout_request_id for update;
  if not found then raise exception 'No M-Pesa payment intent for checkout request %', p_checkout_request_id; end if;

  -- Re-check after taking the lock (a concurrent callback may have won).
  select payment_id into v_existing from public.mpesa_transactions
  where mpesa_receipt_number = p_mpesa_receipt_number;
  if found then return v_existing; end if;

  if v_intent.status <> 'pending' then
    raise exception 'M-Pesa intent is % and cannot be completed', v_intent.status;
  end if;
  if p_amount_cents is distinct from v_intent.amount_cents then
    raise exception 'M-Pesa amount % does not match the intent amount %', p_amount_cents, v_intent.amount_cents;
  end if;

  insert into public.payments
    (customer_id, payment_method, amount_cents, status, received_at, reference, notes)
  values
    (v_intent.customer_id, 'mpesa', p_amount_cents, 'pending', p_transacted_at, p_mpesa_receipt_number,
     'Confirmed by M-Pesa callback')
  returning id into v_payment;

  update public.payments
  set status = 'confirmed', verified_at = now(), verification_notes = 'Confirmed by M-Pesa callback'
  where id = v_payment;

  perform public.post_payment_ledger(v_payment, null);

  insert into public.mpesa_transactions
    (payment_intent_id, payment_id, mpesa_receipt_number, amount_cents, transacted_at, phone_number)
  values
    (v_intent.id, v_payment, p_mpesa_receipt_number, p_amount_cents, p_transacted_at, p_phone_number);

  update public.mpesa_payment_intents set status = 'completed' where id = v_intent.id;

  if v_intent.invoice_id is not null then
    select outstanding_cents into v_outstanding
    from (
      select greatest(i.total_cents
        - coalesce((select sum(amount_cents) from public.payment_allocations where invoice_id = i.id), 0)
        - coalesce((select sum(total_cents) from public.credit_notes where invoice_id = i.id), 0), 0) as outstanding_cents,
        i.status
      from public.invoices i where i.id = v_intent.invoice_id
    ) q
    where q.status in ('issued', 'partially_paid', 'overdue');
    if coalesce(v_outstanding, 0) > 0 then
      insert into public.payment_allocations (payment_id, invoice_id, amount_cents)
      values (v_payment, v_intent.invoice_id, least(p_amount_cents, v_outstanding));
    end if;
  end if;

  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------
-- 13. Read functions
-- ---------------------------------------------------------------------
create or replace function public.get_customer_balance(p_customer_id uuid default null)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer uuid;
begin
  if p_customer_id is null then
    v_customer := public.customer_id();
  elsif coalesce(public.user_role(), '') in ('super_admin', 'admin', 'finance') then
    v_customer := p_customer_id;
  else
    raise exception 'Not authorized to view another customer''s balance' using errcode = '42501';
  end if;
  if v_customer is null then return 0; end if;

  return coalesce((
    select sum(case entry_type when 'debit' then amount_cents else -amount_cents end)
    from public.ledger_entries
    where customer_id = v_customer and ledger_account = 'receivable'
  ), 0)::bigint;
end;
$$;

create or replace function public.get_account_statement(
  p_customer_id uuid,
  p_from        date default null,
  p_to          date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_to   date := coalesce(p_to, (now() at time zone 'Africa/Nairobi')::date);
  v_open bigint := 0;
  v_rows jsonb;
  v_deb  bigint;
  v_cred bigint;
begin
  if coalesce(public.user_role(), '') not in ('super_admin', 'admin', 'finance') then
    raise exception 'Not authorized to view account statements' using errcode = '42501';
  end if;

  if p_from is not null then
    select coalesce(sum(case le.entry_type when 'debit' then le.amount_cents else -le.amount_cents end), 0)
    into v_open
    from public.ledger_entries le
    where le.customer_id = p_customer_id and le.ledger_account = 'receivable'
      and (le.created_at at time zone 'Africa/Nairobi')::date < p_from;
  end if;

  with e as (
    select le.id, le.created_at, ft.reference_table, ft.reference_id, le.description,
           case when le.entry_type = 'debit'  then le.amount_cents else 0 end as debit_cents,
           case when le.entry_type = 'credit' then le.amount_cents else 0 end as credit_cents
    from public.ledger_entries le
    join public.financial_transactions ft on ft.id = le.financial_transaction_id
    where le.customer_id = p_customer_id and le.ledger_account = 'receivable'
      and (p_from is null or (le.created_at at time zone 'Africa/Nairobi')::date >= p_from)
      and (le.created_at at time zone 'Africa/Nairobi')::date <= v_to
  ), r as (
    select e.*,
      v_open + sum(e.debit_cents - e.credit_cents) over (order by e.created_at, e.id) as running_balance_cents,
      case e.reference_table
        when 'invoices'            then (select invoice_number     from public.invoices            where id = e.reference_id)
        when 'payments'            then (select coalesce(reference, internal_reference) from public.payments where id = e.reference_id)
        when 'credit_notes'        then (select credit_note_number from public.credit_notes        where id = e.reference_id)
        when 'finance_adjustments' then (select adjustment_number  from public.finance_adjustments where id = e.reference_id)
        else e.reference_id::text
      end as reference
    from e
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'date', (r.created_at at time zone 'Africa/Nairobi')::date,
      'reference', r.reference,
      'description', r.description,
      'debit_cents', r.debit_cents,
      'credit_cents', r.credit_cents,
      'running_balance_cents', r.running_balance_cents
    ) order by r.created_at, r.id), '[]'::jsonb),
    coalesce(sum(r.debit_cents), 0),
    coalesce(sum(r.credit_cents), 0)
  into v_rows, v_deb, v_cred
  from r;

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'from', p_from,
    'to', v_to,
    'opening_balance_cents', v_open,
    'rows', v_rows,
    'total_debits_cents', v_deb,
    'total_credits_cents', v_cred,
    'closing_balance_cents', v_open + v_deb - v_cred
  );
end;
$$;

create or replace function public.finance_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if coalesce(public.user_role(), '') not in ('super_admin', 'admin', 'finance') then
    raise exception 'Not authorized to view finance figures' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'invoiced_total_cents',     coalesce((select sum(total_cents) from public.invoices where status not in ('draft', 'void')), 0),
    'collected_total_cents',    coalesce((select sum(amount_cents) from public.payments where status = 'confirmed'), 0),
    'invoiced_range_cents',     coalesce((select sum(total_cents) from public.invoices
                                          where status not in ('draft', 'void') and issue_date between p_from and p_to), 0),
    'invoices_range_count',     (select count(*) from public.invoices
                                 where status not in ('draft', 'void') and issue_date between p_from and p_to),
    'collected_range_cents',    coalesce((select sum(amount_cents) from public.payments
                                          where status = 'confirmed'
                                            and (received_at at time zone 'Africa/Nairobi')::date between p_from and p_to), 0),
    'payments_range_count',     (select count(*) from public.payments
                                 where status = 'confirmed'
                                   and (received_at at time zone 'Africa/Nairobi')::date between p_from and p_to),
    'outstanding_cents',        coalesce((select sum(outstanding_cents) from public.invoice_balances
                                          where status in ('issued', 'partially_paid', 'overdue')), 0),
    'overdue_cents',            coalesce((select sum(outstanding_cents) from public.invoice_balances where is_overdue), 0),
    'overdue_count',            (select count(*) from public.invoice_balances where is_overdue),
    'pending_cheques_count',    (select count(*) from public.payments where status = 'pending' and payment_method = 'cheque'),
    'pending_cheques_cents',    coalesce((select sum(amount_cents) from public.payments
                                          where status = 'pending' and payment_method = 'cheque'), 0),
    'pending_payments_count',   (select count(*) from public.payments where status = 'pending'),
    'unallocated_count',        (select count(*) from public.payment_allocation_status
                                 where status = 'confirmed' and unallocated_cents > 0),
    'unallocated_cents',        coalesce((select sum(unallocated_cents) from public.payment_allocation_status
                                          where status = 'confirmed'), 0),
    'mpesa_exceptions_count',   (select count(*) from public.mpesa_callback_records where processing_error is not null)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- 14. Remove direct write access; everything goes through the functions
-- ---------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('invoices', 'invoice_items', 'payments', 'payment_allocations', 'receipts',
                        'financial_transactions', 'ledger_entries', 'cheque_payments', 'refund_payouts')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 15. Function privileges
-- ---------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_invoice(uuid, date, date, date, date, text, jsonb)',
    'public.discard_draft_invoice(uuid)',
    'public.issue_invoice(uuid)',
    'public.cancel_invoice(uuid, text)',
    'public.record_payment(uuid, public.payment_method, bigint, timestamptz, text, text, uuid, jsonb)',
    'public.verify_payment(uuid, boolean, text)',
    'public.allocate_payment(uuid, uuid, bigint)',
    'public.issue_credit_note(uuid, uuid, bigint, integer, text)',
    'public.create_debit_adjustment(uuid, bigint, text, text, text, uuid)',
    'public.request_refund(uuid, bigint, public.refund_payout_method, text)',
    'public.approve_refund(uuid)',
    'public.reject_refund(uuid, text)',
    'public.complete_refund(uuid, text)',
    'public.get_customer_balance(uuid)',
    'public.get_account_statement(uuid, date, date)',
    'public.finance_summary(date, date)',
    'public.set_finance_setting(text, text)',
    'public.get_finance_setting(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- Internal helpers: never callable from the API.
revoke all on function public.post_payment_ledger(uuid, uuid) from public, anon, authenticated;
revoke all on function public.require_finance_writer() from public, anon;
grant execute on function public.require_finance_writer() to authenticated;

-- Trusted M-Pesa confirmation: service role only (never authenticated/anon).
revoke all on function public.confirm_mpesa_payment(text, text, bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_mpesa_payment(text, text, bigint, text, timestamptz) to service_role;
