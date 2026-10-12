-- 007_payments.sql
-- PAYMENTS domain (M-Pesa, cheque, reconciliation, refunds). Depends on
-- 002 (customers), 006 (invoices, payments, financial_transactions,
-- reject_update(), validate_financial_transaction_reference()), 001
-- (enforce_status_transition, status_transition_rules seeded for
-- 'mpesa_payment_intents'). Same financial-sensitivity rule as 006:
-- FORCE ROW LEVEL SECURITY everywhere.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.mpesa_intent_status as enum
  ('initiated', 'pending', 'completed', 'failed', 'expired');
create type public.cheque_status as enum ('pending_clearance', 'cleared', 'bounced');
create type public.reconciliation_batch_status as enum
  ('open', 'completed', 'completed_with_exceptions');
create type public.reconciliation_match_status as enum ('matched', 'unmatched', 'disputed');
create type public.refund_payout_status as enum ('pending', 'completed', 'failed');
create type public.refund_payout_method as enum ('mpesa_b2c', 'bank_transfer', 'cheque');

-- ---------------------------------------------------------------------
-- mpesa_payment_intents / mpesa_transactions / mpesa_callback_records
-- ---------------------------------------------------------------------

create table public.mpesa_payment_intents (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references public.customers (id) on delete restrict,
  invoice_id            uuid references public.invoices (id) on delete restrict,
  -- Client-generated, present before Daraja has responded - this is what
  -- makes a retried STK-push call idempotent (rule 3).
  idempotency_key       text not null unique,
  amount_cents          bigint not null check (amount_cents > 0),
  phone_number          text not null,
  merchant_request_id   text,
  checkout_request_id   text,
  status                public.mpesa_intent_status not null default 'initiated',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index mpesa_payment_intents_checkout_request_id_key
  on public.mpesa_payment_intents (checkout_request_id) where checkout_request_id is not null;

create index mpesa_payment_intents_customer_id_idx on public.mpesa_payment_intents (customer_id);
create index mpesa_payment_intents_status_idx on public.mpesa_payment_intents (status);

create trigger set_updated_at
  before update on public.mpesa_payment_intents
  for each row execute function public.set_updated_at();

create trigger enforce_status_transition
  before update of status on public.mpesa_payment_intents
  for each row execute function public.enforce_status_transition();

create trigger audit_mpesa_payment_intents
  after insert or update or delete on public.mpesa_payment_intents
  for each row execute function public.log_audit_event();

create function public.transition_mpesa_intent_status(
  p_intent_id uuid,
  p_new_status public.mpesa_intent_status
)
returns public.mpesa_payment_intents
language plpgsql
as $$
declare
  v_row public.mpesa_payment_intents;
begin
  update public.mpesa_payment_intents
  set status = p_new_status
  where id = p_intent_id
  returning * into v_row;

  if not found then
    raise exception 'mpesa_payment_intents.id % not found', p_intent_id;
  end if;

  return v_row;
end;
$$;

create table public.mpesa_transactions (
  id                     uuid primary key default gen_random_uuid(),
  payment_intent_id      uuid not null references public.mpesa_payment_intents (id) on delete restrict,
  payment_id             uuid references public.payments (id) on delete restrict,
  -- Safaricom's own idempotent transaction ID - the real idempotency
  -- anchor. The callback handler should INSERT ... ON CONFLICT
  -- (mpesa_receipt_number) DO NOTHING, making a duplicate callback a
  -- no-op rather than a second row.
  mpesa_receipt_number   text not null unique,
  amount_cents           bigint not null check (amount_cents > 0),
  transacted_at          timestamptz not null,
  phone_number           text not null,
  created_at             timestamptz not null default now()
);

create index mpesa_transactions_payment_intent_id_idx on public.mpesa_transactions (payment_intent_id);
create index mpesa_transactions_payment_id_idx on public.mpesa_transactions (payment_id);

create trigger audit_mpesa_transactions
  after insert or update or delete on public.mpesa_transactions
  for each row execute function public.log_audit_event();

create trigger reject_update
  before update on public.mpesa_transactions
  for each row execute function public.reject_update();

create table public.mpesa_callback_records (
  id                  uuid primary key default gen_random_uuid(),
  payment_intent_id   uuid references public.mpesa_payment_intents (id) on delete set null,
  raw_payload         jsonb not null,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  processing_error    text,
  created_at          timestamptz not null default now()
);

comment on table public.mpesa_callback_records is
  'Raw Daraja callback payloads, logged verbatim before any parsing. Not '
  'itself audited via log_audit_event - already an immutable raw-payload '
  'log; never deleted.';

create index mpesa_callback_records_payment_intent_id_idx
  on public.mpesa_callback_records (payment_intent_id);
create index mpesa_callback_records_processed_at_idx
  on public.mpesa_callback_records (processed_at);

-- ---------------------------------------------------------------------
-- cheque_payments
-- ---------------------------------------------------------------------

create table public.cheque_payments (
  id               uuid primary key default gen_random_uuid(),
  payment_id       uuid not null references public.payments (id) on delete restrict,
  cheque_number    text not null,
  bank_name        text not null,
  deposited_date   date not null,
  cleared_date     date,
  status           public.cheque_status not null default 'pending_clearance',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (bank_name, cheque_number)
);

create index cheque_payments_payment_id_idx on public.cheque_payments (payment_id);
create index cheque_payments_status_idx on public.cheque_payments (status);

create trigger set_updated_at
  before update on public.cheque_payments
  for each row execute function public.set_updated_at();

create trigger audit_cheque_payments
  after insert or update or delete on public.cheque_payments
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- reconciliation_batches / reconciliation_items
-- ---------------------------------------------------------------------

create table public.reconciliation_batches (
  id             uuid primary key default gen_random_uuid(),
  batch_type     text not null check (batch_type in ('mpesa_settlement', 'bank_statement')),
  period_start   date not null,
  period_end     date not null,
  status         public.reconciliation_batch_status not null default 'open',
  performed_by   uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start)
);

create trigger set_updated_at
  before update on public.reconciliation_batches
  for each row execute function public.set_updated_at();

create trigger audit_reconciliation_batches
  after insert or update or delete on public.reconciliation_batches
  for each row execute function public.log_audit_event();

create table public.reconciliation_items (
  id                   uuid primary key default gen_random_uuid(),
  batch_id             uuid not null references public.reconciliation_batches (id) on delete cascade,
  payment_id           uuid references public.payments (id) on delete set null,
  external_reference   text not null,
  amount_cents         bigint not null check (amount_cents > 0),
  match_status         public.reconciliation_match_status not null default 'unmatched',
  notes                text,
  created_at           timestamptz not null default now()
);

create index reconciliation_items_batch_id_idx on public.reconciliation_items (batch_id);
create index reconciliation_items_payment_id_idx on public.reconciliation_items (payment_id);

create trigger audit_reconciliation_items
  after insert or update or delete on public.reconciliation_items
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- refund_payouts (Decision 8)
-- ---------------------------------------------------------------------

create table public.refund_payouts (
  id                        uuid primary key default gen_random_uuid(),
  financial_transaction_id  uuid not null references public.financial_transactions (id) on delete restrict,
  customer_id               uuid not null references public.customers (id) on delete restrict,
  payout_method             public.refund_payout_method not null,
  amount_cents              bigint not null check (amount_cents > 0),
  currency                  char(3) not null default 'KES',
  status                    public.refund_payout_status not null default 'pending',
  external_reference        text,
  initiated_by              uuid references public.profiles (id) on delete set null,
  completed_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.refund_payouts is
  'Money-out leg of a refund (Decision 8): payment -> refund transaction '
  '(financial_transactions, transaction_type = refund_issued) -> refund '
  'payout (this table) -> ledger adjustment (ledger_entries). Kept as a '
  'dedicated table rather than overloading payments with a negative '
  'amount/direction flag.';

create index refund_payouts_financial_transaction_id_idx
  on public.refund_payouts (financial_transaction_id);
create index refund_payouts_customer_id_idx on public.refund_payouts (customer_id);
create index refund_payouts_status_idx on public.refund_payouts (status);

create trigger set_updated_at
  before update on public.refund_payouts
  for each row execute function public.set_updated_at();

create trigger audit_refund_payouts
  after insert or update or delete on public.refund_payouts
  for each row execute function public.log_audit_event();

-- Extend financial_transactions' polymorphic reference validation (from
-- 006_finance.sql) now that refund_payouts exists. Same trigger, already
-- attached to financial_transactions - CREATE OR REPLACE swaps its body.
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
  else
    raise exception 'financial_transactions.reference_table % is not a recognized reference type', new.reference_table;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: enable AND force, policies in 011_rls_policies.sql
-- ---------------------------------------------------------------------

alter table public.mpesa_payment_intents enable row level security;
alter table public.mpesa_payment_intents force row level security;
alter table public.mpesa_transactions enable row level security;
alter table public.mpesa_transactions force row level security;
alter table public.mpesa_callback_records enable row level security;
alter table public.mpesa_callback_records force row level security;
alter table public.cheque_payments enable row level security;
alter table public.cheque_payments force row level security;
alter table public.reconciliation_batches enable row level security;
alter table public.reconciliation_batches force row level security;
alter table public.reconciliation_items enable row level security;
alter table public.reconciliation_items force row level security;
alter table public.refund_payouts enable row level security;
alter table public.refund_payouts force row level security;
