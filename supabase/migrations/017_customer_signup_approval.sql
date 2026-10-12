-- 017_customer_signup_approval.sql
--
-- Customer self-signup now needs SUPER ADMIN approval before the customer can
-- use the portal. NOT executed against a database when written (no local
-- Postgres was available) - run `supabase db reset` and
-- `supabase test db` (see supabase/tests/customer_signup_approval.sql) first.
--
-- Design:
--   * customers.approval_status: pending | approved | rejected.
--     Existing rows and staff-created customers default to 'approved'.
--     Only the self-signup trigger below inserts 'pending'.
--   * customer_signup_requests keeps everything the paper on-boarding form
--     collects that has no home in the core schema (services, days, billing
--     cycle, caretaker, region...). Admin reads it when reviewing.
--   * Enforcement is in the database, not the UI:
--       - customer_id() and owns_service_address() return nothing for a
--         customer who is not approved, so every existing customer RLS
--         policy stops granting access;
--       - only a super_admin can change approval_status (guard trigger +
--         review_customer_signup()).
--   * Nothing here relaxes an existing policy.

-- ---------------------------------------------------------------------
-- Enums + column
-- ---------------------------------------------------------------------

create type public.customer_approval_status as enum ('pending', 'approved', 'rejected');
create type public.billing_cycle as enum ('monthly', 'quarterly', 'half_yearly', 'yearly');

alter table public.customers
  add column approval_status public.customer_approval_status not null default 'approved';

create index customers_approval_status_idx on public.customers (approval_status);

-- ---------------------------------------------------------------------
-- customer_signup_requests
-- ---------------------------------------------------------------------

create table public.customer_signup_requests (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null unique references public.customers (id) on delete cascade,
  customer_type       public.customer_type not null,
  name                text not null,
  email               citext,
  phone_primary       text,
  phone_secondary     text,
  county              text,
  ward                text,
  region              text,
  street_name         text,
  house_number        text,
  address_description text,
  requested_services  text[] not null default '{}',
  service_days        smallint[] not null default '{}',
  billing_cycle       public.billing_cycle,
  caretaker_name      text,
  caretaker_phone     text,
  caretaker_email     citext,
  submitted_at        timestamptz not null default now(),
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  review_note         text,
  check (cardinality(requested_services) <= 20),
  check (service_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  check (review_note is null or length(review_note) <= 1000)
);

comment on table public.customer_signup_requests is
  'What a customer submitted on the sign-up form. Informational for the '
  'reviewing super admin; requested_services/service_days/billing_cycle are '
  'REQUESTS, not subscriptions - an admin creates real subscriptions. '
  'service_days: 0 = Sunday ... 6 = Saturday (same as collection_schedules).';

alter table public.customer_signup_requests enable row level security;

-- Super admin only. Rows are written by the signup trigger and
-- review_customer_signup() (both SECURITY DEFINER), never by clients.
create policy customer_signup_requests_select_super_admin
on public.customer_signup_requests
for select
to authenticated
using (public.user_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- Approval gate: customer_id() and owns_service_address()
-- ---------------------------------------------------------------------

-- Same signature/behaviour as 002, plus: only an APPROVED customer resolves.
create or replace function public.customer_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cp.customer_id
  from public.customer_profiles cp
  join public.customers c on c.id = cp.customer_id
  where cp.id = auth.uid()
    and c.approval_status = 'approved';
$$;

-- Same as 010, plus the approval requirement (this helper did not go through
-- customer_id(), so it needs its own gate).
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
    join public.customer_profiles cp on cp.customer_id = sa.customer_id
    join public.customers c on c.id = sa.customer_id
    where sa.id = p_service_address_id
      and cp.id = auth.uid()
      and c.approval_status = 'approved'
  );
$$;

-- The signed-in customer's own approval status, readable even while pending
-- (a pending customer cannot SELECT their customers row under RLS).
-- Returns null for a user with no customer link (e.g. staff).
create or replace function public.customer_approval_status()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.approval_status::text
  from public.customer_profiles cp
  join public.customers c on c.id = cp.customer_id
  where cp.id = auth.uid();
$$;

revoke all on function public.customer_approval_status() from public, anon;
grant execute on function public.customer_approval_status() to authenticated;

-- ---------------------------------------------------------------------
-- Only a super admin may change approval_status
-- ---------------------------------------------------------------------

create or replace function public.guard_customer_approval_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.approval_status is distinct from old.approval_status then
    -- auth.uid() is null for the trusted backend (service role / migrations);
    -- any signed-in user must be a super_admin.
    if auth.uid() is not null and public.user_role() is distinct from 'super_admin' then
      raise exception 'Only a super admin can change a customer''s approval status'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_customer_approval_change
  before update of approval_status on public.customers
  for each row execute function public.guard_customer_approval_change();

-- ---------------------------------------------------------------------
-- Approve / reject (called from /admin/customer-approvals)
-- ---------------------------------------------------------------------

create or replace function public.review_customer_signup(
  p_customer_id uuid,
  p_approve     boolean,
  p_note        text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  if public.user_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can review customer sign-ups'
      using errcode = '42501';
  end if;

  update public.customers
  set approval_status = case when p_approve then 'approved' else 'rejected' end::public.customer_approval_status
  where id = p_customer_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'customers.id % not found', p_customer_id;
  end if;

  update public.customer_signup_requests
  set reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(left(trim(coalesce(p_note, '')), 1000), '')
  where customer_id = p_customer_id;
end;
$$;

revoke all on function public.review_customer_signup(uuid, boolean, text) from public, anon;
grant execute on function public.review_customer_signup(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Signup trigger: create everything from the form, as PENDING
-- ---------------------------------------------------------------------
-- Replaces the 015 version. Still skips staff provisioning. Metadata is
-- untrusted (anyone can call the auth signup endpoint), so: the role is
-- always 'customer', approval is always 'pending', and enum/array casts
-- raise on bad input. The app validates first for friendly messages.

create or replace function public.handle_new_customer_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_customer_id uuid;
  v_role_id     uuid;
  v_type        public.customer_type := 'individual';
  v_name        text;
  v_phone1      text;
  v_phone2      text;
  v_phone3      text;
  v_care_phone  text;
  v_address     text;
  v_county      text;
  v_property_id uuid;
  v_services    text[] := '{}';
  v_days        smallint[] := '{}';
  v_cycle       public.billing_cycle;
begin
  if v_meta ->> 'provisioning' = 'staff' then
    return new;
  end if;

  select id into v_role_id from public.roles where code = 'customer' limit 1;

  if nullif(v_meta ->> 'customer_type', '') is not null then
    v_type := (v_meta ->> 'customer_type')::public.customer_type;
  end if;

  v_name := left(coalesce(nullif(trim(v_meta ->> 'full_name'), ''), split_part(new.email, '@', 1)), 200);
  v_phone1 := nullif(trim(v_meta ->> 'phone_primary'), '');
  v_phone2 := nullif(trim(v_meta ->> 'phone_secondary'), '');
  v_phone3 := nullif(trim(v_meta ->> 'phone_tertiary'), '');
  v_care_phone := nullif(trim(v_meta ->> 'caretaker_phone'), '');
  v_county := nullif(trim(v_meta ->> 'county'), '');
  v_address := nullif(concat_ws(', ',
    nullif(trim(v_meta ->> 'house_number'), ''),
    nullif(trim(v_meta ->> 'street_name'), ''),
    nullif(trim(v_meta ->> 'address_description'), '')
  ), '');

  if jsonb_typeof(v_meta -> 'requested_services') = 'array' then
    select coalesce(array_agg(left(s, 80)), '{}') into v_services
    from jsonb_array_elements_text(v_meta -> 'requested_services') as s;
  end if;

  if jsonb_typeof(v_meta -> 'service_days') = 'array' then
    select coalesce(array_agg(d::smallint), '{}') into v_days
    from jsonb_array_elements_text(v_meta -> 'service_days') as d;
  end if;

  if nullif(v_meta ->> 'billing_cycle', '') is not null then
    v_cycle := (v_meta ->> 'billing_cycle')::public.billing_cycle;
  end if;

  insert into public.profiles (id, role_id, kind, full_name, phone)
  values (new.id, v_role_id, 'customer', v_name, v_phone1);

  insert into public.customers (customer_type, display_name, billing_email, billing_phone, approval_status)
  values (v_type, v_name, new.email, v_phone1, 'pending')
  returning id into v_customer_id;

  insert into public.customer_profiles (id, customer_id, is_primary_contact)
  values (new.id, v_customer_id, true);

  insert into public.customer_signup_requests (
    customer_id, customer_type, name, email, phone_primary, phone_secondary,
    county, ward, region, street_name, house_number, address_description,
    requested_services, service_days, billing_cycle,
    caretaker_name, caretaker_phone, caretaker_email
  )
  values (
    v_customer_id, v_type, v_name, new.email, v_phone1, v_phone2,
    v_county,
    left(nullif(trim(v_meta ->> 'ward'), ''), 200),
    left(nullif(trim(v_meta ->> 'region'), ''), 200),
    left(nullif(trim(v_meta ->> 'street_name'), ''), 200),
    left(nullif(trim(v_meta ->> 'house_number'), ''), 200),
    left(nullif(trim(v_meta ->> 'address_description'), ''), 500),
    v_services, v_days, v_cycle,
    left(nullif(trim(v_meta ->> 'caretaker_name'), ''), 200),
    v_care_phone,
    nullif(trim(v_meta ->> 'caretaker_email'), '')
  );

  -- Contacts: only when both required phones were supplied (013 requires a
  -- primary AND secondary). One INSERT so the deferred check sees the full set.
  if v_phone1 is not null and v_phone2 is not null and v_phone1 <> v_phone2 then
    insert into public.customer_contacts (customer_id, full_name, phone, receives_invoices, contact_phone_type)
    values
      (v_customer_id, v_name, v_phone1, true, 'primary'),
      (v_customer_id, v_name, v_phone2, false, 'secondary');

    if v_phone3 is not null and v_phone3 not in (v_phone1, v_phone2) then
      insert into public.customer_contacts (customer_id, full_name, phone, receives_invoices, contact_phone_type)
      values (v_customer_id, v_name, v_phone3, false, 'tertiary');
    end if;
  end if;

  -- Collection address, when the form gave one. Region maps to sub_county
  -- (the closest existing column); the original is kept in the request row.
  if v_address is not null and v_county is not null then
    insert into public.properties (customer_id, property_type, name, address_line, ward, sub_county, county)
    values (
      v_customer_id,
      case when v_type = 'corporate' then 'commercial' else 'residential' end::public.property_type,
      v_name,
      left(v_address, 500),
      left(nullif(trim(v_meta ->> 'ward'), ''), 200),
      left(nullif(trim(v_meta ->> 'region'), ''), 200),
      v_county
    )
    returning id into v_property_id;

    insert into public.service_addresses (property_id, customer_id, label, status)
    values (v_property_id, v_customer_id, 'Main collection address', 'active');
  end if;

  return new;
end;
$$;

comment on function public.handle_new_customer_signup() is
  'Self-service signup: creates profile, PENDING customer, link, signup '
  'request, contacts and first service address from auth user metadata. '
  'Skips staff provisioning (provisioning = ''staff''). A super admin must '
  'approve via review_customer_signup() before the customer can use the portal.';
