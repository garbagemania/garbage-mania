-- 003_commercial.sql
-- COMMERCIAL domain. Depends on 001 (documents, enforce_status_transition,
-- status_transition_rules) and 002 (customers, service_addresses).

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.waste_type as enum ('general', 'recyclable', 'organic', 'hazardous', 'bulky');
create type public.plan_frequency as enum ('weekly', 'biweekly', 'monthly', 'on_demand');
create type public.contract_billing_terms as enum ('prepaid', 'net_15', 'net_30');
create type public.contract_status as enum ('draft', 'active', 'expired', 'terminated');
create type public.subscription_status as enum ('pending', 'active', 'paused', 'cancelled');
create type public.subscription_change_type as enum
  ('created', 'plan_changed', 'paused', 'resumed', 'cancelled', 'address_changed');

-- ---------------------------------------------------------------------
-- service_plans / service_plan_prices
-- ---------------------------------------------------------------------

create table public.service_plans (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  waste_type         public.waste_type not null,
  container_type     text,
  default_frequency  public.plan_frequency not null,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.service_plans
  for each row execute function public.set_updated_at();

create trigger audit_service_plans
  after insert or update or delete on public.service_plans
  for each row execute function public.log_audit_event();

create table public.service_plan_prices (
  id               uuid primary key default gen_random_uuid(),
  service_plan_id  uuid not null references public.service_plans (id) on delete cascade,
  price_cents      bigint not null check (price_cents >= 0),
  currency         char(3) not null default 'KES',
  effective_from   date not null,
  effective_to     date,
  created_at       timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

comment on table public.service_plan_prices is
  'Versioned pricing. Never update a price in place - insert a new row '
  'with a new effective_from; close the previous row''s effective_to in '
  'the same transaction. Immutable once inserted (no updated_at).';

create index service_plan_prices_plan_id_idx
  on public.service_plan_prices (service_plan_id, effective_from);

-- Exactly one "current" (effective_to is null) price per plan.
create unique index service_plan_prices_one_current_per_plan
  on public.service_plan_prices (service_plan_id) where effective_to is null;

-- ---------------------------------------------------------------------
-- contracts
-- ---------------------------------------------------------------------

create table public.contracts (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers (id) on delete restrict,
  contract_number     text not null unique,
  start_date          date not null,
  end_date            date,
  billing_terms       public.contract_billing_terms not null,
  status              public.contract_status not null default 'draft',
  signed_document_id  uuid references public.documents (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index contracts_customer_id_idx on public.contracts (customer_id);
create index contracts_status_idx on public.contracts (status);

create trigger set_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

create trigger enforce_status_transition
  before update of status on public.contracts
  for each row execute function public.enforce_status_transition();

create trigger audit_contracts
  after insert or update or delete on public.contracts
  for each row execute function public.log_audit_event();

create function public.transition_contract_status(
  p_contract_id uuid,
  p_new_status public.contract_status
)
returns public.contracts
language plpgsql
as $$
declare
  v_row public.contracts;
begin
  update public.contracts
  set status = p_new_status
  where id = p_contract_id
  returning * into v_row;

  if not found then
    raise exception 'contracts.id % not found', p_contract_id;
  end if;

  return v_row;
end;
$$;

comment on function public.transition_contract_status(uuid, public.contract_status) is
  'Application-facing entry point for changing a contract''s status. The '
  'enforce_status_transition trigger on contracts still rejects illegal '
  'transitions even if this function is bypassed - this function exists '
  'for a clean call site and a friendlier not-found error.';

-- ---------------------------------------------------------------------
-- subscriptions / subscription_history
-- ---------------------------------------------------------------------

create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references public.contracts (id) on delete restrict,
  -- Denormalized from contracts.customer_id, same rationale as
  -- service_addresses.customer_id in 002.
  customer_id         uuid not null references public.customers (id) on delete restrict,
  service_address_id  uuid not null references public.service_addresses (id) on delete restrict,
  service_plan_id     uuid not null references public.service_plans (id) on delete restrict,
  frequency           public.plan_frequency not null,
  status              public.subscription_status not null default 'pending',
  start_date          date not null,
  end_date            date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index subscriptions_customer_id_idx on public.subscriptions (customer_id);
create index subscriptions_service_address_id_idx on public.subscriptions (service_address_id);
create index subscriptions_status_idx on public.subscriptions (status);

create function public.sync_subscription_customer()
returns trigger
language plpgsql
as $$
begin
  select customer_id into new.customer_id
  from public.contracts
  where id = new.contract_id;

  if new.customer_id is null then
    raise exception 'subscriptions.contract_id % does not resolve to a customer', new.contract_id;
  end if;

  return new;
end;
$$;

create trigger sync_subscription_customer
  before insert or update of contract_id on public.subscriptions
  for each row execute function public.sync_subscription_customer();

create trigger set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger enforce_status_transition
  before update of status on public.subscriptions
  for each row execute function public.enforce_status_transition();

create trigger audit_subscriptions
  after insert or update or delete on public.subscriptions
  for each row execute function public.log_audit_event();

create table public.subscription_history (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions (id) on delete cascade,
  change_type      public.subscription_change_type not null,
  previous_value   jsonb,
  new_value        jsonb not null,
  changed_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

comment on table public.subscription_history is
  'Append-only change log for subscriptions. Not itself audited via '
  'log_audit_event - it is already a change log.';

create index subscription_history_subscription_id_idx
  on public.subscription_history (subscription_id);

create function public.transition_subscription_status(
  p_subscription_id uuid,
  p_new_status public.subscription_status,
  p_changed_by uuid default null
)
returns public.subscriptions
language plpgsql
as $$
declare
  v_row public.subscriptions;
  v_change_type public.subscription_change_type;
begin
  v_change_type := case p_new_status
    when 'active' then 'resumed'
    when 'paused' then 'paused'
    when 'cancelled' then 'cancelled'
    else 'plan_changed'
  end;

  update public.subscriptions
  set status = p_new_status
  where id = p_subscription_id
  returning * into v_row;

  if not found then
    raise exception 'subscriptions.id % not found', p_subscription_id;
  end if;

  insert into public.subscription_history
    (subscription_id, change_type, new_value, changed_by)
  values
    (p_subscription_id, v_change_type, to_jsonb(v_row), p_changed_by);

  return v_row;
end;
$$;

comment on function public.transition_subscription_status(uuid, public.subscription_status, uuid) is
  'Atomically updates a subscription''s status and records the change in '
  'subscription_history in one call, so the two can never fall out of '
  'sync. The enforce_status_transition trigger still rejects illegal '
  'transitions regardless of how the UPDATE is issued.';

-- ---------------------------------------------------------------------
-- RLS: enable now, policies in 011_rls_policies.sql
-- ---------------------------------------------------------------------

alter table public.service_plans enable row level security;
alter table public.service_plan_prices enable row level security;
alter table public.contracts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_history enable row level security;
