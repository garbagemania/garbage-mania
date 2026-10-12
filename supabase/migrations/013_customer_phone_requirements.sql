-- ============================================================
-- 013_customer_phone_requirements.sql
-- Customer registration phone requirements
--
-- Every customer must have:
--   1. Primary phone   - required
--   2. Secondary phone - required
--   3. Tertiary phone  - optional
--
-- Phone numbers live in customer_contacts rather than customers.
-- ============================================================

alter table public.customer_contacts
  add column contact_phone_type text;

alter table public.customer_contacts
  add constraint customer_contacts_contact_phone_type_check
  check (
    contact_phone_type in (
      'primary',
      'secondary',
      'tertiary'
    )
  );

-- Each customer can have only one contact of each phone type.
create unique index customer_contacts_customer_phone_type_uidx
  on public.customer_contacts (customer_id, contact_phone_type);

-- A phone number cannot be assigned twice to the same customer.
create unique index customer_contacts_customer_phone_uidx
  on public.customer_contacts (customer_id, phone)
  where phone is not null;

-- Primary and secondary phone contacts must contain a phone number.
alter table public.customer_contacts
  add constraint customer_contacts_required_phone_check
  check (
    contact_phone_type = 'tertiary'
    or phone is not null
  );

-- A customer must have both a primary and secondary phone.
--
-- This is enforced through a deferred constraint trigger so the
-- application can insert/update the contacts inside one transaction.
create or replace function public.validate_customer_required_phones()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_customer_id uuid;
  primary_count integer;
  secondary_count integer;
begin
  target_customer_id := coalesce(NEW.customer_id, OLD.customer_id);

  select count(*)
    into primary_count
  from public.customer_contacts
  where customer_id = target_customer_id
    and contact_phone_type = 'primary'
    and phone is not null;

  select count(*)
    into secondary_count
  from public.customer_contacts
  where customer_id = target_customer_id
    and contact_phone_type = 'secondary'
    and phone is not null;

  if primary_count < 1 or secondary_count < 1 then
    raise exception
      'Customer % must have both a primary and secondary phone number',
      target_customer_id
      using errcode = '23514';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create constraint trigger validate_customer_required_phones
after insert or update or delete
on public.customer_contacts
deferrable initially deferred
for each row
execute function public.validate_customer_required_phones();
