-- 006_finance.sql
-- FINANCE domain. Depends on 002 (customers), 003 (subscriptions), 005
-- (collections), 001 (documents, enforce_status_transition,
-- status_transition_rules seeded for 'invoices', auth.user_role()), 002
-- (auth.customer_id()). Strictest domain in the schema: FORCE ROW LEVEL
-- SECURITY everywhere, immutability guards on every append-only table.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.invoice_status as enum
  ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void');
create type public.payment_method as enum ('mpesa', 'cheque', 'cash', 'bank_transfer');
create type public.payment_status as enum ('pending', 'confirmed', 'failed', 'reversed');
create type public.ledger_entry_type as enum ('debit', 'credit');
create type public.financial_transaction_type as enum
  ('invoice_issued', 'payment_received', 'refund_issued', 'adjustment', 'write_off');

-- ---------------------------------------------------------------------
-- invoices / invoice_items
-- ---------------------------------------------------------------------

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete restrict,
  invoice_number  text not null unique,
  issue_date      date not null,
  due_date        date not null,
  status          public.invoice_status not null default 'draft',
  subtotal_cents  bigint not null check (subtotal_cents >= 0),
  tax_cents       bigint not null default 0 check (tax_cents >= 0),
  total_cents     bigint not null check (total_cents >= 0),
  currency        char(3) not null default 'KES',
  voided_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (total_cents = subtotal_cents + tax_cents),
  check (due_date >= issue_date),
  check (status <> 'void' or voided_reason is not null)
);

create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_status_idx on public.invoices (status);
create index invoices_due_date_idx on public.invoices (due_date);

create trigger set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger enforce_status_transition
  before update of status on public.invoices
  for each row execute function public.enforce_status_transition();

create trigger audit_invoices
  after insert or update or delete on public.invoices
  for each row execute function public.log_audit_event();

create function public.transition_invoice_status(
  p_invoice_id uuid,
  p_new_status public.invoice_status
)
returns public.invoices
language plpgsql
as $$
declare
  v_row public.invoices;
begin
  update public.invoices
  set status = p_new_status
  where id = p_invoice_id
  returning * into v_row;

  if not found then
    raise exception 'invoices.id % not found', p_invoice_id;
  end if;

  return v_row;
end;
$$;

create table public.invoice_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices (id) on delete cascade,
  subscription_id  uuid references public.subscriptions (id) on delete restrict,
  collection_id    uuid references public.collections (id) on delete restrict,
  description      text not null,
  quantity         numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  amount_cents     bigint not null check (amount_cents >= 0),
  created_at       timestamptz not null default now(),
  check (amount_cents = round(quantity * unit_price_cents)::bigint)
);

create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

-- Line items are freely editable while the parent invoice is 'draft', and
-- frozen the moment it is not (rule 2: "auditable and immutable where
-- required"). Applies to UPDATE and DELETE; INSERT is unrestricted here
-- since a new draft invoice must be able to receive its first items.
create function public.guard_invoice_items_immutability()
returns trigger
language plpgsql
as $$
declare
  v_status public.invoice_status;
  v_invoice_id uuid;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  select status into v_status from public.invoices where id = v_invoice_id;

  if v_status is distinct from 'draft' then
    raise exception 'invoice_items cannot be changed once the parent invoice (%) is no longer draft (currently %)',
      v_invoice_id, v_status;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_invoice_items_immutability
  before update or delete on public.invoice_items
  for each row execute function public.guard_invoice_items_immutability();

-- ---------------------------------------------------------------------
-- payments / payment_allocations / receipts
-- ---------------------------------------------------------------------

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete restrict,
  payment_method  public.payment_method not null,
  amount_cents    bigint not null check (amount_cents > 0),
  currency        char(3) not null default 'KES',
  status          public.payment_status not null default 'pending',
  received_at     timestamptz not null,
  reference       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index payments_customer_id_idx on public.payments (customer_id);
create index payments_status_idx on public.payments (status);
create index payments_received_at_idx on public.payments (received_at);

create trigger set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.log_audit_event();

create table public.payment_allocations (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references public.payments (id) on delete restrict,
  invoice_id   uuid not null references public.invoices (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  created_at   timestamptz not null default now()
);

create index payment_allocations_payment_id_idx on public.payment_allocations (payment_id);
create index payment_allocations_invoice_id_idx on public.payment_allocations (invoice_id);

-- Guards both invariants from BUSINESS_SCHEMA.md §C: sum of a payment's
-- allocations never exceeds the payment's amount; sum of an invoice's
-- allocations never exceeds its total. `for update` row locks on the
-- payment/invoice rows serialize concurrent allocation inserts against
-- the same payment or invoice, closing the race a plain SELECT-then-check
-- would leave open.
create function public.validate_payment_allocation()
returns trigger
language plpgsql
as $$
declare
  v_payment_amount bigint;
  v_allocated_for_payment bigint;
  v_invoice_total bigint;
  v_allocated_for_invoice bigint;
begin
  select amount_cents into v_payment_amount
  from public.payments where id = new.payment_id for update;

  select coalesce(sum(amount_cents), 0) into v_allocated_for_payment
  from public.payment_allocations where payment_id = new.payment_id;

  if v_allocated_for_payment + new.amount_cents > v_payment_amount then
    raise exception 'Allocation of % exceeds payment % remaining balance (allocated so far: %, payment total: %)',
      new.amount_cents, new.payment_id, v_allocated_for_payment, v_payment_amount;
  end if;

  select total_cents into v_invoice_total
  from public.invoices where id = new.invoice_id for update;

  select coalesce(sum(amount_cents), 0) into v_allocated_for_invoice
  from public.payment_allocations where invoice_id = new.invoice_id;

  if v_allocated_for_invoice + new.amount_cents > v_invoice_total then
    raise exception 'Allocation of % exceeds invoice % remaining balance (allocated so far: %, invoice total: %)',
      new.amount_cents, new.invoice_id, v_allocated_for_invoice, v_invoice_total;
  end if;

  return new;
end;
$$;

create trigger validate_payment_allocation
  before insert on public.payment_allocations
  for each row execute function public.validate_payment_allocation();

-- Derives invoice.status from the sum of its allocations - application
-- code never sets 'partially_paid'/'paid' directly once the invoice is
-- issued, so this can't drift from the actual allocation total.
create function public.recompute_invoice_status()
returns trigger
language plpgsql
as $$
declare
  v_status public.invoice_status;
  v_total bigint;
  v_allocated bigint;
begin
  select status, total_cents into v_status, v_total
  from public.invoices where id = new.invoice_id for update;

  if v_status in ('draft', 'void') then
    return new; -- allocations shouldn't exist against these; nothing to derive
  end if;

  select coalesce(sum(amount_cents), 0) into v_allocated
  from public.payment_allocations where invoice_id = new.invoice_id;

  if v_allocated >= v_total then
    update public.invoices set status = 'paid' where id = new.invoice_id and status <> 'paid';
  elsif v_allocated > 0 then
    update public.invoices set status = 'partially_paid'
    where id = new.invoice_id and status not in ('partially_paid', 'paid');
  end if;

  return new;
end;
$$;

create trigger recompute_invoice_status
  after insert on public.payment_allocations
  for each row execute function public.recompute_invoice_status();

create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  payment_id      uuid not null references public.payments (id) on delete restrict,
  receipt_number  text not null unique,
  document_id     uuid references public.documents (id) on delete set null,
  issued_at       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index receipts_payment_id_idx on public.receipts (payment_id);

create trigger audit_receipts
  after insert or update or delete on public.receipts
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- financial_transactions / ledger_entries
-- ---------------------------------------------------------------------

create table public.financial_transactions (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers (id) on delete restrict,
  transaction_type  public.financial_transaction_type not null,
  -- Deliberately polymorphic (Decision 2, this round): no real FK to
  -- invoices/payments/refund_payouts, by design, so this one table can
  -- reference any of them. See validate_financial_transaction_reference()
  -- below for the database-level check this trades for real FK
  -- enforcement, and the documented limitation that remains.
  reference_table   text not null,
  reference_id      uuid not null,
  amount_cents      bigint not null check (amount_cents > 0),
  currency          char(3) not null default 'KES',
  notes             text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  check (transaction_type not in ('adjustment', 'write_off') or notes is not null)
);

comment on column public.financial_transactions.reference_id is
  'Polymorphic pointer, paired with reference_table. NOT a real foreign '
  'key - Postgres cannot enforce that this row points at a live record. '
  'validate_financial_transaction_reference() checks existence at INSERT '
  'time for the reference_table values known to this schema (invoices, '
  'payments, and - once 007_payments.sql runs - refund_payouts), but '
  'this is a one-time INSERT-time check, not an ongoing FK guarantee: if '
  'the referenced row were later deleted, nothing here would prevent or '
  'cascade that (in practice this schema never hard-deletes rows from '
  'invoices/payments/refund_payouts, so the gap is narrow, but it is '
  'real and documented here per the approved decision rather than '
  'silently assumed away).';

create index financial_transactions_customer_id_idx on public.financial_transactions (customer_id);
create index financial_transactions_reference_idx
  on public.financial_transactions (reference_table, reference_id);
create index financial_transactions_type_idx on public.financial_transactions (transaction_type);

-- Extended in 007_payments.sql (CREATE OR REPLACE) once refund_payouts
-- exists - see that file for the 'refund_payouts' branch.
create function public.validate_financial_transaction_reference()
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
  else
    raise exception 'financial_transactions.reference_table % is not a recognized reference type', new.reference_table;
  end if;
  return new;
end;
$$;

create trigger validate_financial_transaction_reference
  before insert on public.financial_transactions
  for each row execute function public.validate_financial_transaction_reference();

create trigger audit_financial_transactions
  after insert or update or delete on public.financial_transactions
  for each row execute function public.log_audit_event();

create table public.ledger_entries (
  id                         uuid primary key default gen_random_uuid(),
  customer_id                uuid not null references public.customers (id) on delete restrict,
  financial_transaction_id   uuid not null references public.financial_transactions (id) on delete restrict,
  entry_type                 public.ledger_entry_type not null,
  amount_cents               bigint not null check (amount_cents > 0),
  currency                   char(3) not null default 'KES',
  description                text not null,
  created_at                 timestamptz not null default now()
);

create index ledger_entries_customer_id_idx on public.ledger_entries (customer_id);
create index ledger_entries_financial_transaction_id_idx
  on public.ledger_entries (financial_transaction_id);

create trigger audit_ledger_entries
  after insert or update or delete on public.ledger_entries
  for each row execute function public.log_audit_event();

-- Invariant: for every financial_transaction_id, sum(debits) = sum(credits).
-- Deferred to COMMIT because the debit and credit rows for one
-- transaction are necessarily separate INSERTs.
create function public.check_ledger_balance()
returns trigger
language plpgsql
as $$
declare
  v_diff bigint;
begin
  select coalesce(sum(
    case when entry_type = 'debit' then amount_cents else -amount_cents end
  ), 0)
  into v_diff
  from public.ledger_entries
  where financial_transaction_id = new.financial_transaction_id;

  if v_diff <> 0 then
    raise exception 'ledger_entries for financial_transaction_id % do not balance (debit - credit = %)',
      new.financial_transaction_id, v_diff;
  end if;

  return new;
end;
$$;

create constraint trigger check_ledger_balance
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.check_ledger_balance();

-- ---------------------------------------------------------------------
-- Immutability: financial_transactions, ledger_entries, and receipts are
-- insert-only. Reused (as-is) by mpesa_transactions in 007_payments.sql.
-- ---------------------------------------------------------------------

create function public.reject_update()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable and cannot be updated (table: %, id: %)',
    tg_table_name, tg_table_name, old.id;
end;
$$;

create trigger reject_update
  before update on public.financial_transactions
  for each row execute function public.reject_update();

create trigger reject_update
  before update on public.ledger_entries
  for each row execute function public.reject_update();

create trigger reject_update
  before update on public.receipts
  for each row execute function public.reject_update();

-- ---------------------------------------------------------------------
-- get_customer_statement(): Decision 9. Exposes invoices, payments,
-- allocations, receipts, and a computed outstanding balance - never
-- ledger_entries or financial_transactions directly. Self-service for a
-- customer caller; staff (super_admin/admin/finance) may pass an explicit
-- customer_id to look up a customer's statement for support purposes.
-- ---------------------------------------------------------------------

create function public.get_customer_statement(p_customer_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  if p_customer_id is null then
    v_customer_id := public.customer_id();
  elsif public.user_role() in ('super_admin', 'admin', 'finance') then
    v_customer_id := p_customer_id;
  else
    raise exception 'Not authorized to view another customer''s statement';
  end if;

  if v_customer_id is null then
    return jsonb_build_object(
      'customer_id', null,
      'invoices', '[]'::jsonb,
      'payments', '[]'::jsonb,
      'allocations', '[]'::jsonb,
      'receipts', '[]'::jsonb,
      'outstanding_balance_cents', 0
    );
  end if;

  return jsonb_build_object(
    'customer_id', v_customer_id,
    'invoices', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.issue_date desc)
      from public.invoices i where i.customer_id = v_customer_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.received_at desc)
      from public.payments p where p.customer_id = v_customer_id
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(to_jsonb(pa))
      from public.payment_allocations pa
      join public.invoices inv on inv.id = pa.invoice_id
      where inv.customer_id = v_customer_id
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.receipts r
      join public.payments pay on pay.id = r.payment_id
      where pay.customer_id = v_customer_id
    ), '[]'::jsonb),
    'outstanding_balance_cents',
      coalesce((
        select sum(total_cents) from public.invoices
        where customer_id = v_customer_id and status <> 'void'
      ), 0)
      - coalesce((
        select sum(pa2.amount_cents)
        from public.payment_allocations pa2
        join public.invoices inv2 on inv2.id = pa2.invoice_id
        where inv2.customer_id = v_customer_id and inv2.status <> 'void'
      ), 0)
  );
end;
$$;

comment on function public.get_customer_statement(uuid) is
  'Customer-facing statement of account (Decision 9). SECURITY INVOKER: '
  'runs as the caller, so RLS on invoices/payments/receipts/'
  'payment_allocations is still the backstop even if the role check '
  'inside this function had a bug. Never queries ledger_entries or '
  'financial_transactions - structurally cannot expose them.';

grant execute on function public.get_customer_statement(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS: enable AND force (finance is the strictest domain), policies in
-- 011_rls_policies.sql
-- ---------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.invoices force row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_items force row level security;
alter table public.payments enable row level security;
alter table public.payments force row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_allocations force row level security;
alter table public.receipts enable row level security;
alter table public.receipts force row level security;
alter table public.financial_transactions enable row level security;
alter table public.financial_transactions force row level security;
alter table public.ledger_entries enable row level security;
alter table public.ledger_entries force row level security;
