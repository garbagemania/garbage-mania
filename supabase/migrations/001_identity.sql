-- 001_identity.sql
-- IDENTITY domain, plus generic cross-domain infrastructure that has to
-- exist before later domains can reference it (documents; the generic
-- status-transition enforcement mechanism used by collections, invoices,
-- subscriptions, contracts, and mpesa_payment_intents).
--
-- Depends on: 000_foundation.sql (extensions, set_updated_at(),
-- audit_log/log_audit_event()). See MIGRATION_PLAN.md §0 and §7.1 for why
-- `documents` lives here instead of 008, and §7.4/§7.5 for the
-- status-transition mechanism this file introduces.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.profile_kind as enum ('staff', 'customer');
create type public.profile_status as enum ('active', 'suspended', 'disabled');

-- ---------------------------------------------------------------------
-- roles / permissions / role_permissions
-- ---------------------------------------------------------------------

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  description text,
  created_at  timestamptz not null default now()
);

comment on table public.roles is
  'Canonical system roles. A real table, not an enum, so a new role is a '
  'data row rather than a migration. Seeded below with the six canonical '
  'roles approved for this system; not constrained to exactly those six '
  'so the table can grow without a migration if a new role is needed.';

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  description text not null,
  created_at  timestamptz not null default now()
);

comment on table public.permissions is
  'Fine-grained in-app capability keys (e.g. invoice.void), for '
  'action-level gates finer than the area-level RBAC in src/middleware.ts. '
  'Left empty by this migration - no permission codes are defined yet.';

create table public.role_permissions (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (role_id, permission_id)
);

-- Seed: the six canonical roles (Decision 1). Reference/lookup data the
-- RBAC system cannot function without - not business/demo data.
insert into public.roles (code, label, description) values
  ('super_admin',        'Super Administrator', 'Full system access across every area, including cross-area break-glass access.'),
  ('admin',               'Administrator',       'Back-office administrator.'),
  ('finance',             'Finance',              'Billing, payments, ledger, statements.'),
  ('operations_manager',  'Operations Manager',   'Routes, vehicles, scheduling, collections.'),
  ('driver',              'Driver',               'Field/collection staff, mobile-first interface.'),
  ('customer',            'Customer',             'Individual or corporate customer (see customers.customer_type).');

-- ---------------------------------------------------------------------
-- profiles / staff_profiles
-- ---------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role_id       uuid not null references public.roles (id) on delete restrict,
  kind          public.profile_kind not null,
  full_name     text not null,
  phone         text,
  status        public.profile_status not null default 'active',
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated identity (auth.users). Extended by exactly '
  'one of staff_profiles (kind=staff) or customer_profiles (kind=customer, '
  'created in 002_customers.sql).';

create index profiles_role_id_idx on public.profiles (role_id);

-- profiles.kind must agree with the linked role: kind='customer' implies
-- role code 'customer'; kind='staff' implies any non-customer role. This
-- can't be a plain CHECK constraint (Postgres CHECK constraints can't
-- contain subqueries against another table), so it's a trigger instead -
-- see MIGRATION_PLAN.md §7 for context on this correction.
create function public.validate_profile_kind()
returns trigger
language plpgsql
as $$
declare
  v_role_code text;
begin
  select code into v_role_code from public.roles where id = new.role_id;
  if v_role_code is null then
    raise exception 'profiles.role_id % does not reference a known role', new.role_id;
  end if;
  if new.kind = 'customer' and v_role_code <> 'customer' then
    raise exception 'profiles.kind = customer requires role "customer", got "%"', v_role_code;
  end if;
  if new.kind = 'staff' and v_role_code = 'customer' then
    raise exception 'profiles.kind = staff cannot be paired with role "customer"';
  end if;
  return new;
end;
$$;

create trigger validate_profile_kind
  before insert or update of role_id, kind on public.profiles
  for each row execute function public.validate_profile_kind();

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.log_audit_event();

create table public.staff_profiles (
  id              uuid primary key references public.profiles (id) on delete cascade,
  employee_number text not null unique,
  department      text,
  hire_date       date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

create trigger audit_staff_profiles
  after insert or update or delete on public.staff_profiles
  for each row execute function public.log_audit_event();

-- Note: customer_profiles is intentionally NOT created here - it FKs to
-- customers.id, which doesn't exist until 002_customers.sql. See
-- MIGRATION_PLAN.md §0.2.

-- ---------------------------------------------------------------------
-- documents (generic file registry - see MIGRATION_PLAN.md §0.1 for why
-- this lives in the identity migration rather than 008_documents.sql)
-- ---------------------------------------------------------------------

create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  checksum     text,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.documents is
  'Generic file registry. Every other domain (contracts, receipts, '
  'collection photos, staff licenses) points here rather than storing its '
  'own storage path. Immutable once created - no updated_at; a replacement '
  'file is a new row, not an edit.';

create index documents_uploaded_by_idx on public.documents (uploaded_by);

create trigger audit_documents
  after insert or update or delete on public.documents
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- auth.user_role() - RLS authority source (Decision 3)
-- ---------------------------------------------------------------------
-- SECURITY DEFINER with an explicitly pinned search_path: this is the
-- standard, required defense against the well-known search_path-hijack
-- risk for SECURITY DEFINER functions - not optional hardening.
--
-- NOTE: creating functions inside the `auth` schema requires the
-- migration role to have CREATE privilege there. This is expected to work
-- via the Supabase CLI's migration role on a standard Supabase project,
-- but has not been verified against a live project in this environment -
-- see MIGRATION_REVIEW.md, "database behavior requiring manual Supabase
-- configuration."

create function public.user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.code
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

grant execute on function public.user_role() to authenticated;

-- ---------------------------------------------------------------------
-- RESTORED: generic status-transition enforcement (extends to
-- collections, invoices, subscriptions, contracts, mpesa_payment_intents
-- - approved to cover all five state machines). A previous edit replaced
-- this with a session-GUC-flag check in 000_foundation.sql
-- (`current_setting('app.allow_status_transition', true) = 'true'`) that
-- no transition_*_status() function anywhere in this schema ever
-- actually sets - meaning, as left, EVERY status update, including calls
-- to the sanctioned transition_*_status() functions themselves, would
-- have been rejected with "Direct status changes are not allowed. Use
-- transition_*_status() functions." - which is precisely backwards. This
-- restores the original, tested design: a reference table of legal
-- transitions, checked by a single generic trigger function.
-- ---------------------------------------------------------------------

create table public.status_transition_rules (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,   -- matches the table name (TG_TABLE_NAME)
  from_status text not null,
  to_status   text not null,
  created_at  timestamptz not null default now(),
  unique (entity_type, from_status, to_status)
);

comment on table public.status_transition_rules is
  'Legal status transitions for every enforced state machine in this '
  'schema (collections, invoices, subscriptions, contracts, '
  'mpesa_payment_intents). Stores status values as text so this table has '
  'no ordering dependency on the enums/tables it governs.';

create index status_transition_rules_entity_idx
  on public.status_transition_rules (entity_type);

alter table public.status_transition_rules enable row level security;

create policy status_transition_rules_select_admin
  on public.status_transition_rules
  for select to authenticated
  using (public.user_role() in ('super_admin', 'admin'));

-- Reference data describing the business's state machines, not
-- business/demo data. Sourced from BUSINESS_SCHEMA.md §B as amended by
-- Decision 7 (collection cancellation).
insert into public.status_transition_rules (entity_type, from_status, to_status) values
  -- collections (Decision 7)
  ('collections', 'scheduled',   'assigned'),
  ('collections', 'assigned',    'in_progress'),
  ('collections', 'in_progress', 'completed'),
  ('collections', 'assigned',    'failed'),
  ('collections', 'in_progress', 'failed'),
  ('collections', 'failed',      'rescheduled'),
  ('collections', 'scheduled',   'cancelled'),
  ('collections', 'assigned',    'cancelled'),
  -- invoices
  ('invoices', 'draft',          'issued'),
  ('invoices', 'issued',         'partially_paid'),
  ('invoices', 'issued',         'paid'),
  ('invoices', 'partially_paid', 'paid'),
  ('invoices', 'issued',         'overdue'),
  ('invoices', 'overdue',        'partially_paid'),
  ('invoices', 'overdue',        'paid'),
  ('invoices', 'issued',         'void'),
  ('invoices', 'overdue',        'void'),
  ('invoices', 'partially_paid', 'void'),
  -- subscriptions
  ('subscriptions', 'pending', 'active'),
  ('subscriptions', 'active',  'paused'),
  ('subscriptions', 'paused',  'active'),
  ('subscriptions', 'active',  'cancelled'),
  ('subscriptions', 'paused',  'cancelled'),
  ('subscriptions', 'pending', 'cancelled'),
  -- contracts
  ('contracts', 'draft',  'active'),
  ('contracts', 'active', 'expired'),
  ('contracts', 'active', 'terminated'),
  -- mpesa_payment_intents
  ('mpesa_payment_intents', 'initiated', 'pending'),
  ('mpesa_payment_intents', 'pending',   'completed'),
  ('mpesa_payment_intents', 'pending',   'failed'),
  ('mpesa_payment_intents', 'pending',   'expired');

-- Replaces the broken GUC-flag version from 000_foundation.sql (create or
-- replace, so this is the version that actually takes effect once both
-- migrations have run - this migration runs after 000 alphabetically).
-- Concurrency: this is a row-level BEFORE UPDATE trigger, so Postgres's
-- normal MVCC/row-locking behavior applies - a concurrent UPDATE on the
-- same row serializes behind the first, so two concurrent writers cannot
-- both apply conflicting transitions from a stale OLD value.
create or replace function public.enforce_status_transition()
returns trigger
language plpgsql
as $$
declare
  v_allowed boolean;
begin
  if new.status = old.status then
    return new; -- not a status change; nothing to validate
  end if;

  select exists (
    select 1
    from public.status_transition_rules
    where entity_type = tg_table_name
      and from_status = old.status::text
      and to_status = new.status::text
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Illegal % status transition: % -> %',
      tg_table_name, old.status, new.status
      using errcode = '23514'; -- check_violation
  end if;

  return new;
end;
$$;

comment on function public.enforce_status_transition() is
  'Generic BEFORE UPDATE OF status guard: rejects any transition not '
  'present in status_transition_rules for tg_table_name.';
