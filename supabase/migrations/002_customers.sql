-- 002_customers.sql
-- CUSTOMERS domain. Depends on 001_identity.sql (profiles, documents,
-- set_updated_at, log_audit_event). Also creates customer_profiles here
-- rather than in 001 - see MIGRATION_PLAN.md §0.2.

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.customer_type as enum ('individual', 'corporate');
create type public.customer_status as enum ('active', 'suspended', 'closed');
create type public.property_type as enum ('residential', 'commercial', 'industrial', 'institutional');
create type public.property_status as enum ('active', 'inactive');
create type public.service_address_status as enum ('active', 'inactive');

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------

create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  customer_type public.customer_type not null,
  display_name  text not null,
  kra_pin       text,
  billing_email citext,
  billing_phone text,
  status        public.customer_status not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index customers_kra_pin_key
  on public.customers (kra_pin) where kra_pin is not null;

create index customers_status_idx on public.customers (status);
create index customers_customer_type_idx on public.customers (customer_type);

create trigger set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger audit_customers
  after insert or update or delete on public.customers
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- customer_contacts
-- ---------------------------------------------------------------------

create table public.customer_contacts (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers (id) on delete cascade,
  full_name         text not null,
  title             text,
  email             citext,
  phone             text,
  receives_invoices boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index customer_contacts_customer_id_idx on public.customer_contacts (customer_id);

create trigger set_updated_at
  before update on public.customer_contacts
  for each row execute function public.set_updated_at();

create trigger audit_customer_contacts
  after insert or update or delete on public.customer_contacts
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------

create table public.properties (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers (id) on delete restrict,
  property_type public.property_type not null,
  name          text,
  address_line  text not null,
  ward          text,
  sub_county    text,
  county        text not null default 'Nairobi',
  latitude      double precision,
  longitude     double precision,
  status        public.property_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index properties_customer_id_idx on public.properties (customer_id);
create index properties_lat_lng_idx on public.properties (latitude, longitude);

create trigger set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

create trigger audit_properties
  after insert or update or delete on public.properties
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- service_addresses
-- ---------------------------------------------------------------------

create table public.service_addresses (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties (id) on delete restrict,
  -- Denormalized from properties.customer_id for query convenience across
  -- every downstream operational table. Kept in sync by trigger below,
  -- never written directly by application code.
  customer_id   uuid not null references public.customers (id) on delete restrict,
  label         text not null,
  access_notes  text,
  latitude      double precision,
  longitude     double precision,
  status        public.service_address_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index service_addresses_property_id_idx on public.service_addresses (property_id);
create index service_addresses_customer_id_idx on public.service_addresses (customer_id);

create function public.sync_service_address_customer()
returns trigger
language plpgsql
as $$
begin
  select customer_id into new.customer_id
  from public.properties
  where id = new.property_id;

  if new.customer_id is null then
    raise exception 'service_addresses.property_id % does not resolve to a customer', new.property_id;
  end if;

  return new;
end;
$$;

comment on function public.sync_service_address_customer() is
  'Keeps service_addresses.customer_id in lockstep with the parent '
  'property''s customer_id. Runs before the row is written, so it '
  'overrides whatever customer_id the caller supplied.';

create trigger sync_service_address_customer
  before insert or update of property_id on public.service_addresses
  for each row execute function public.sync_service_address_customer();

create trigger set_updated_at
  before update on public.service_addresses
  for each row execute function public.set_updated_at();

create trigger audit_service_addresses
  after insert or update or delete on public.service_addresses
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- customer_profiles (links a login identity to a billing customer)
-- ---------------------------------------------------------------------

create table public.customer_profiles (
  id                  uuid primary key references public.profiles (id) on delete cascade,
  customer_id         uuid not null references public.customers (id) on delete restrict,
  is_primary_contact  boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index customer_profiles_customer_id_idx on public.customer_profiles (customer_id);

-- At most one primary-contact login per customer.
create unique index customer_profiles_one_primary_per_customer
  on public.customer_profiles (customer_id) where is_primary_contact;

create trigger set_updated_at
  before update on public.customer_profiles
  for each row execute function public.set_updated_at();

create trigger audit_customer_profiles
  after insert or update or delete on public.customer_profiles
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- auth.customer_id() - now that customer_profiles exists
-- ---------------------------------------------------------------------

create function public.customer_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cp.customer_id
  from public.customer_profiles cp
  where cp.id = auth.uid();
$$;

grant execute on function public.customer_id() to authenticated;
