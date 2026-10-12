-- 005_operations.sql
-- OPERATIONS domain. Depends on 002 (customers, service_addresses), 003
-- (subscriptions), 004 (vehicles, drivers), and 001 (documents,
-- enforce_status_transition, status_transition_rules already seeded for
-- 'collections'). This is the largest and riskiest migration in the set -
-- see MIGRATION_PLAN.md §7.3/§7.4/§7.12/§7.13 before editing it.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

-- Decision 7: cancellation is a first-class status, distinct from failed.
create type public.collection_status as enum
  ('scheduled', 'assigned', 'in_progress', 'completed', 'failed', 'rescheduled', 'cancelled');

-- Decision 3 (this round): reason_code is a closed enum, not free text,
-- covering both the failure-path and cancellation-path reasons for
-- consistency within one column.
create type public.collection_status_reason as enum (
  'gate_locked',
  'customer_absent',
  'bin_not_out',
  'customer_cancelled',
  'operational_cancelled',
  'weather',
  'vehicle_issue',
  'other'
);

create type public.request_status as enum
  ('submitted', 'approved', 'scheduled', 'rejected', 'cancelled');

create type public.daily_assignment_status as enum
  ('planned', 'dispatched', 'in_progress', 'completed', 'cancelled');

-- ---------------------------------------------------------------------
-- routes / route_stops
-- ---------------------------------------------------------------------

create table public.routes (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  area                text,
  default_vehicle_id  uuid references public.vehicles (id) on delete set null,
  default_driver_id   uuid references public.drivers (id) on delete set null,
  status              public.property_status not null default 'active', -- reuse: active/inactive
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.routes
  for each row execute function public.set_updated_at();

create trigger audit_routes
  after insert or update or delete on public.routes
  for each row execute function public.log_audit_event();

create table public.route_stops (
  id                   uuid primary key default gen_random_uuid(),
  route_id             uuid not null references public.routes (id) on delete cascade,
  service_address_id   uuid not null references public.service_addresses (id) on delete restrict,
  sequence_number      smallint not null check (sequence_number > 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (route_id, sequence_number),
  unique (route_id, service_address_id)
);

create index route_stops_route_id_idx on public.route_stops (route_id);
create index route_stops_service_address_id_idx on public.route_stops (service_address_id);

create trigger set_updated_at
  before update on public.route_stops
  for each row execute function public.set_updated_at();

create trigger audit_route_stops
  after insert or update or delete on public.route_stops
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- collection_schedules
-- ---------------------------------------------------------------------

create table public.collection_schedules (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions (id) on delete cascade,
  day_of_week      smallint check (day_of_week between 0 and 6),
  day_of_month     smallint check (day_of_month between 1 and 31),
  route_id         uuid references public.routes (id) on delete set null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (day_of_week is not null or day_of_month is not null)
);

create index collection_schedules_subscription_id_idx on public.collection_schedules (subscription_id);
create index collection_schedules_route_id_idx on public.collection_schedules (route_id);

create trigger set_updated_at
  before update on public.collection_schedules
  for each row execute function public.set_updated_at();

create trigger audit_collection_schedules
  after insert or update or delete on public.collection_schedules
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- waste_collection_requests
-- Created WITHOUT its resulting_collection_id FK - collections doesn't
-- exist yet (circular dependency; see MIGRATION_PLAN.md §7.3). The FK is
-- added via ALTER TABLE further down, once collections exists.
-- ---------------------------------------------------------------------

create table public.waste_collection_requests (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              uuid not null references public.customers (id) on delete restrict,
  service_address_id       uuid not null references public.service_addresses (id) on delete restrict,
  waste_type               public.waste_type not null,
  requested_date           date not null,
  notes                    text,
  status                   public.request_status not null default 'submitted',
  resulting_collection_id  uuid, -- FK added below, after collections exists
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index waste_collection_requests_customer_id_idx on public.waste_collection_requests (customer_id);
create index waste_collection_requests_status_idx on public.waste_collection_requests (status);

create trigger set_updated_at
  before update on public.waste_collection_requests
  for each row execute function public.set_updated_at();

create trigger audit_waste_collection_requests
  after insert or update or delete on public.waste_collection_requests
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- daily_assignments / driver_assignments
-- ---------------------------------------------------------------------

create table public.daily_assignments (
  id               uuid primary key default gen_random_uuid(),
  route_id         uuid not null references public.routes (id) on delete restrict,
  assignment_date  date not null,
  status           public.daily_assignment_status not null default 'planned',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (route_id, assignment_date)
);

create index daily_assignments_assignment_date_idx on public.daily_assignments (assignment_date);
create index daily_assignments_status_idx on public.daily_assignments (status);

create trigger set_updated_at
  before update on public.daily_assignments
  for each row execute function public.set_updated_at();

create trigger audit_daily_assignments
  after insert or update or delete on public.daily_assignments
  for each row execute function public.log_audit_event();

create table public.driver_assignments (
  id                    uuid primary key default gen_random_uuid(),
  daily_assignment_id   uuid not null references public.daily_assignments (id) on delete cascade,
  driver_id             uuid not null references public.drivers (id) on delete restrict,
  vehicle_id            uuid not null references public.vehicles (id) on delete restrict,
  started_at            timestamptz,
  ended_at              timestamptz,
  created_at            timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index driver_assignments_daily_assignment_id_idx on public.driver_assignments (daily_assignment_id);
create index driver_assignments_driver_id_idx on public.driver_assignments (driver_id);
create index driver_assignments_vehicle_id_idx on public.driver_assignments (vehicle_id);

-- At most one "currently active" driver leg per daily_assignment.
-- Not in BUSINESS_SCHEMA.md - added while sequencing this migration; see
-- MIGRATION_PLAN.md §7.12.
create unique index driver_assignments_one_active_leg
  on public.driver_assignments (daily_assignment_id) where ended_at is null;

create trigger audit_driver_assignments
  after insert or update or delete on public.driver_assignments
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------

create table public.collections (
  id                       uuid primary key default gen_random_uuid(),
  daily_assignment_id      uuid references public.daily_assignments (id) on delete restrict,
  service_address_id       uuid not null references public.service_addresses (id) on delete restrict,
  subscription_id          uuid references public.subscriptions (id) on delete restrict,
  collection_request_id    uuid references public.waste_collection_requests (id) on delete restrict,
  scheduled_date           date not null,
  status                   public.collection_status not null default 'scheduled',
  arrived_at               timestamptz,
  completed_at             timestamptz,
  weight_kg                numeric(8, 2),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (
    (subscription_id is not null and collection_request_id is null)
    or (subscription_id is null and collection_request_id is not null)
  )
);

comment on column public.collections.subscription_id is
  'Exactly one of subscription_id / collection_request_id must be set - '
  'a collection always traces to either the recurring schedule or an '
  'ad-hoc request, never both, never neither.';

create index collections_service_address_id_idx on public.collections (service_address_id);
create index collections_subscription_id_idx on public.collections (subscription_id);
create index collections_scheduled_date_idx on public.collections (scheduled_date);
create index collections_status_idx on public.collections (status);

create trigger set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create trigger enforce_status_transition
  before update of status on public.collections
  for each row execute function public.enforce_status_transition();

create trigger audit_collections
  after insert or update or delete on public.collections
  for each row execute function public.log_audit_event();

-- Now that collections exists, close the circular dependency.
alter table public.waste_collection_requests
  add constraint waste_collection_requests_resulting_collection_id_fkey
  foreign key (resulting_collection_id) references public.collections (id)
  on delete set null;

-- ---------------------------------------------------------------------
-- collection_status_events
-- ---------------------------------------------------------------------

create table public.collection_status_events (
  id              uuid primary key default gen_random_uuid(),
  collection_id   uuid not null references public.collections (id) on delete cascade,
  from_status     text,
  to_status       text not null,
  reason_code     public.collection_status_reason,
  actor_id        uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table public.collection_status_events is
  'Domain-specific status-transition history for collections, with a '
  'reason code - distinct from audit_log, which records that a row '
  'changed but not the business reason. Not itself audited via '
  'log_audit_event.';

create index collection_status_events_collection_id_idx
  on public.collection_status_events (collection_id);

create table public.failed_collections (
  id                          uuid primary key default gen_random_uuid(),
  collection_id               uuid not null unique references public.collections (id) on delete cascade,
  reason_code                 public.collection_status_reason not null,
  notes                       text,
  rescheduled_collection_id   uuid references public.collections (id) on delete set null,
  created_at                  timestamptz not null default now()
);

create index failed_collections_rescheduled_collection_id_idx
  on public.failed_collections (rescheduled_collection_id);

create trigger audit_failed_collections
  after insert or update or delete on public.failed_collections
  for each row execute function public.log_audit_event();

create table public.collection_evidence (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid not null references public.collections (id) on delete cascade,
  document_id    uuid not null references public.documents (id) on delete restrict,
  latitude       double precision,
  longitude      double precision,
  captured_at    timestamptz not null,
  created_at     timestamptz not null default now()
);

comment on table public.collection_evidence is
  'Photo/GPS proof captured at a collection. Not itself audited - it is '
  'the evidentiary record.';

create index collection_evidence_collection_id_idx on public.collection_evidence (collection_id);

-- ---------------------------------------------------------------------
-- transition_collection_status(): atomic status change + reasoned history
-- ---------------------------------------------------------------------

create function public.transition_collection_status(
  p_collection_id uuid,
  p_new_status public.collection_status,
  p_reason_code public.collection_status_reason default null,
  p_actor_id uuid default null
)
returns public.collections
language plpgsql
as $$
declare
  v_row public.collections;
  v_old_status public.collection_status;
begin
  select status into v_old_status from public.collections where id = p_collection_id;

  if v_old_status is null then
    raise exception 'collections.id % not found', p_collection_id;
  end if;

  if p_new_status in ('failed', 'cancelled') and p_reason_code is null then
    raise exception 'reason_code is required when transitioning to %', p_new_status;
  end if;

  update public.collections
  set status = p_new_status
  where id = p_collection_id
  returning * into v_row;
  -- (raises via the enforce_status_transition trigger if the transition
  -- is illegal; execution stops there and nothing below runs)

  insert into public.collection_status_events
    (collection_id, from_status, to_status, reason_code, actor_id)
  values
    (p_collection_id, v_old_status::text, p_new_status::text, p_reason_code, p_actor_id);

  return v_row;
end;
$$;

comment on function public.transition_collection_status(uuid, public.collection_status, public.collection_status_reason, uuid) is
  'Application-facing entry point for changing a collection''s status: '
  'updates collections.status and inserts the matching '
  'collection_status_events row atomically, so the two can never fall out '
  'of sync. Requires a reason_code for failed/cancelled. The '
  'enforce_status_transition trigger on collections is still the actual '
  'legality guard - this function is the recommended call site, not the '
  'only enforcement layer.';

-- ---------------------------------------------------------------------
-- RLS: enable now, policies in 011_rls_policies.sql
-- ---------------------------------------------------------------------

alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.collection_schedules enable row level security;
alter table public.waste_collection_requests enable row level security;
alter table public.daily_assignments enable row level security;
alter table public.driver_assignments enable row level security;
alter table public.collections enable row level security;
alter table public.collection_status_events enable row level security;
alter table public.failed_collections enable row level security;
alter table public.collection_evidence enable row level security;
