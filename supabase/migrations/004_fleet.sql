-- 004_fleet.sql
-- FLEET domain. Depends on 001 (staff_profiles).
-- Must run before 005_operations.sql: routes.default_vehicle_id and
-- routes.default_driver_id FK into this file's tables.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.vehicle_status as enum ('active', 'in_maintenance', 'out_of_service');
create type public.driver_status as enum ('active', 'suspended', 'inactive');

-- ---------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------

create table public.vehicles (
  id                    uuid primary key default gen_random_uuid(),
  registration_number   text not null unique,
  vehicle_type          text,
  capacity_kg           numeric(8, 2),
  status                public.vehicle_status not null default 'active',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index vehicles_status_idx on public.vehicles (status);

create trigger set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create trigger audit_vehicles
  after insert or update or delete on public.vehicles
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------

create table public.drivers (
  id              uuid primary key references public.staff_profiles (id) on delete restrict,
  license_number  text not null unique,
  license_expiry  date not null,
  status          public.driver_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index drivers_status_idx on public.drivers (status);

create trigger set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

create trigger audit_drivers
  after insert or update or delete on public.drivers
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- vehicle_status_history
-- ---------------------------------------------------------------------

create table public.vehicle_status_history (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
  from_status  text,
  to_status    text not null,
  reason       text,
  changed_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.vehicle_status_history is
  'Audit trail of vehicle.status changes. Not itself audited via '
  'log_audit_event - it is already a history table. from_status/to_status '
  'are plain text (not the vehicle_status enum) so a historical row '
  'remains valid even if the live enum changes later.';

create index vehicle_status_history_vehicle_id_idx
  on public.vehicle_status_history (vehicle_id);

-- ---------------------------------------------------------------------
-- maintenance_records
-- ---------------------------------------------------------------------

create table public.maintenance_records (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles (id) on delete restrict,
  maintenance_type  text not null,
  description       text,
  cost_cents        bigint check (cost_cents >= 0),
  currency          char(3) not null default 'KES',
  odometer_km       integer check (odometer_km >= 0),
  performed_at      date not null,
  next_due_date     date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index maintenance_records_vehicle_id_idx on public.maintenance_records (vehicle_id);
create index maintenance_records_next_due_date_idx on public.maintenance_records (next_due_date);

create trigger set_updated_at
  before update on public.maintenance_records
  for each row execute function public.set_updated_at();

create trigger audit_maintenance_records
  after insert or update or delete on public.maintenance_records
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- RLS: enable now, policies in 011_rls_policies.sql
-- ---------------------------------------------------------------------

alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicle_status_history enable row level security;
alter table public.maintenance_records enable row level security;
