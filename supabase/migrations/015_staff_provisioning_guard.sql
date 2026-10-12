-- 015_staff_provisioning_guard.sql
--
-- Fixes a real conflict between 014_auth_customer_trigger.sql (fires on
-- EVERY new auth.users row and provisions a customer profile) and
-- scripts/bootstrap-admin.ts (creates the first super_admin via
-- supabase.auth.admin.inviteUserByEmail(), which is also an insert into
-- auth.users). Without this fix, inviting the first admin would race
-- with the customer-provisioning trigger: the trigger would create a
-- 'customer' profiles row for that user first, then bootstrap-admin.ts's
-- own insert into profiles would fail with a duplicate primary key
-- error (profiles.id is the auth user's id either way).
--
-- Fix: any staff-provisioned auth.users row is created with
-- raw_user_meta_data containing {"provisioning": "staff"} - this
-- migration updates handle_new_customer_signup() to skip customer
-- provisioning entirely when that flag is present. Real customer
-- self-signups never set this flag, so their behavior is unchanged.
-- scripts/bootstrap-admin.ts is updated in the same change to set it.

create or replace function public.handle_new_customer_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_id uuid;
  customer_role_id uuid;
begin
  -- Staff accounts (created via the Admin API by bootstrap-admin.ts, or
  -- later by an admin-console staff-invite feature) are never customers -
  -- skip provisioning entirely and let the caller create the
  -- profiles/staff_profiles rows itself.
  if new.raw_user_meta_data ->> 'provisioning' = 'staff' then
    return new;
  end if;

  select id
  into customer_role_id
  from public.roles
  where code = 'customer'
  limit 1;

  insert into public.profiles (
    id,
    role_id,
    kind,
    full_name,
    phone
  )
  values (
    new.id,
    customer_role_id,
    'customer',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'phone_primary'
  );

  insert into public.customers (
    customer_type,
    display_name,
    billing_email,
    billing_phone
  )
  values (
    'individual',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.email,
    new.raw_user_meta_data->>'phone_primary'
  )
  returning id into customer_id;

  insert into public.customer_profiles (
    id,
    customer_id,
    is_primary_contact
  )
  values (
    new.id,
    customer_id,
    true
  );

  return new;
end;
$$;

comment on function public.handle_new_customer_signup() is
  'Auto-provisions a customer profile for self-service signups. Skips '
  'entirely when raw_user_meta_data.provisioning = ''staff'' - see '
  'scripts/bootstrap-admin.ts, which sets that flag when inviting the '
  'first super_admin, and should be set by any future staff-invite '
  'feature too.';
