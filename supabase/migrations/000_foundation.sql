-- Garbage Mania Services Ltd — foundation migration
--
-- This migration establishes database TECHNOLOGY and INFRASTRUCTURE only.
-- It deliberately creates NO business tables (no customers, contracts,
-- subscriptions, services, routes, vehicles, collections, invoices,
-- payments, ledgers, notifications, or documents) and NO sample/seed rows
-- of any kind. The full production schema is a separate, dedicated step.
--
-- What this migration provides for every future migration to build on:
--   1. Extensions the whole system will need.
--   2. A generic `set_updated_at()` trigger function, so every future table
--      that needs an `updated_at` column can attach it with one line instead
--      of redefining the trigger each time.
--   3. A generic, append-only `audit_log` table + `log_audit_event()` trigger
--      function, so future business tables can opt into audit logging by
--      attaching a trigger — the audit infrastructure itself has to exist
--      before any table can use it, and it is intentionally schema-agnostic
--      (it works via TG_TABLE_NAME / row-to-jsonb, not per-table code).

-- 1. Extensions -----------------------------------------------------------

create extension if not exists "pgcrypto";   -- gen_random_uuid() for primary keys
create extension if not exists "citext";     -- case-insensitive text (emails, etc.)

-- 2. Reusable updated_at trigger ------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Attach as a BEFORE UPDATE trigger to any table with an updated_at column: '
  'create trigger set_updated_at before update on <table> '
  'for each row execute function public.set_updated_at();';

-- 3. Generic audit log infrastructure --------------------------------------
-- Structure only, per the brief: nothing writes business rows into this yet
-- because no business tables exist yet. Future tables opt in individually.

create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  table_name    text not null,
  record_id     text not null,
  action        text not null check (action in ('insert', 'update', 'delete')),
  actor_id      uuid references auth.users (id) on delete set null,
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only audit trail. Populated by log_audit_event() triggers attached '
  'to individual business tables once they exist. Never updated or deleted '
  'from application code.';

create index if not exists audit_log_table_record_idx
  on public.audit_log (table_name, record_id);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- No policies yet: until roles/profiles exist (schema-design phase), no
-- client role should be able to read or write this table directly at all.
-- Service-role (server-only) access bypasses RLS by design and is how
-- triggers/background jobs will write to it.

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_log (table_name, record_id, action, actor_id, new_data)
    values (tg_table_name, new.id::text, 'insert', auth.uid(), to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (tg_table_name, new.id::text, 'update', auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data)
    values (tg_table_name, old.id::text, 'delete', auth.uid(), to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

comment on function public.log_audit_event() is
  'Attach as an AFTER INSERT OR UPDATE OR DELETE trigger to any business '
  'table with a uuid id column to record every change to public.audit_log: '
  'create trigger audit_<table> after insert or update or delete on <table> '
  'for each row execute function public.log_audit_event();';

-- NOTE: enforce_status_transition() intentionally does NOT live here.
-- A previous edit added a session-GUC-flag version of it in this exact
-- spot (checking current_setting('app.allow_status_transition', true)),
-- but nothing in this schema's transition_*_status() functions ever set
-- that flag - meaning every legitimate status change, including calls to
-- those sanctioned functions, would have been rejected. Removed; the
-- real, working definition (checked against status_transition_rules) is
-- in 001_identity.sql, which is also the architecturally correct home
-- for it (this file is meant to hold only generic, domain-agnostic
-- infrastructure - extensions, set_updated_at, audit_log).
