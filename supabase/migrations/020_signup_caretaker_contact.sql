-- 020_signup_caretaker_contact.sql
--
-- NOT yet executed against a database - run `supabase db reset` and
-- `supabase test db`.
--
-- Found by supabase/tests/customer_signup_approval.sql (assertion 3):
--   * The paper on-boarding form's "Contact Person / C.O." (caretaker) was only
--     kept in customer_signup_requests; no customer_contacts row was created.
--     The signup trigger now also creates it (title 'Contact person / caretaker',
--     contact_phone_type NULL).
--   * A sign-up with neither full_name nor an email produced a NULL profile
--     name and an obscure not-null error. profiles.full_name stays NOT NULL;
--     the trigger now raises a clear error instead.
-- Replaces the 017 version of handle_new_customer_signup() otherwise unchanged.

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

  v_name := left(coalesce(nullif(trim(v_meta ->> 'full_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), '')), 200);
  if v_name is null then
    -- profiles.full_name is NOT NULL by design. Fail with a clear message
    -- rather than an obscure not-null violation from deep in this trigger.
    raise exception 'Customer sign-up requires a full_name (or an email address) in the sign-up details'
      using errcode = '23502';
  end if;
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

    -- Contact person / caretaker (C.O.) from the sign-up form. Not a phone-type
    -- row (contact_phone_type stays NULL, which 013 permits), so it does not
    -- count toward the primary/secondary requirement. Its phone is only stored
    -- when it does not duplicate another number for this customer (unique index).
    if nullif(trim(v_meta ->> 'caretaker_name'), '') is not null then
      insert into public.customer_contacts (customer_id, full_name, title, email, phone, receives_invoices)
      values (
        v_customer_id,
        left(trim(v_meta ->> 'caretaker_name'), 200),
        'Contact person / caretaker',
        nullif(trim(v_meta ->> 'caretaker_email'), ''),
        case when v_care_phone is not null
                  and v_care_phone not in (v_phone1, v_phone2, coalesce(v_phone3, ''))
             then v_care_phone end,
        false
      );
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
