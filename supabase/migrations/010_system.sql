-- 010_system.sql
-- SYSTEM domain. `audit_log` and `log_audit_event()` already exist from
-- 000_foundation.sql - nothing to add for those here. This migration adds
-- only `operational_events`.

create table public.operational_events (
  id             uuid primary key default gen_random_uuid(),
  -- Deliberately `text`, not an enum: this table exists specifically so a
  -- new kind of operational event doesn't require a migration. Contrast
  -- with collection_status/invoice_status/etc., whose transition graphs
  -- are load-bearing business rules and so are closed enums.
  event_type     text not null,
  related_table  text,
  related_id     uuid,
  payload        jsonb,
  actor_id       uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

comment on table public.operational_events is
  'Business-level event stream for dashboards/timelines/reporting - '
  'distinct from audit_log, which records row-level changes regardless '
  'of business meaning. Not itself audited (it is a log); written only by '
  'triggers/background jobs via the service-role client, never directly '
  'by any RLS-governed role - see 011_rls_policies.sql.';

create index operational_events_event_type_idx on public.operational_events (event_type);
create index operational_events_related_idx on public.operational_events (related_table, related_id);
create index operational_events_created_at_idx on public.operational_events (created_at desc);

alter table public.operational_events enable row level security;
-- ============================================================
-- RLS HELPER FUNCTIONS
-- ============================================================

create or replace function public.owns_service_address(
  p_service_address_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.service_addresses sa
    join public.customer_profiles cp
      on cp.customer_id = sa.customer_id
    where sa.id = p_service_address_id
      and cp.id = auth.uid()
  );
$$;
