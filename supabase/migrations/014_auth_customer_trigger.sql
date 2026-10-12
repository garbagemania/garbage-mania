-- Automatically create customer records after Supabase Auth signup

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

  -- Get customer role dynamically
  select id
  into customer_role_id
  from public.roles
  where code = 'customer'
  limit 1;


  -- Create profile linked to auth user
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


  -- Create customer account
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


  -- Link login profile to customer
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


drop trigger if exists on_auth_user_created_customer
on auth.users;


create trigger on_auth_user_created_customer
after insert on auth.users
for each row
execute function public.handle_new_customer_signup();
