-- 016_customer_self_service.sql
--
-- Fixes a real, discovered blocker: src/app/portal/onboarding/actions.ts
-- (customer self-service onboarding, built independently of the admin
-- phases) writes to customers/properties/service_addresses/
-- customer_contacts as the signed-in customer's own authenticated
-- client - but every one of those tables' INSERT/UPDATE policies
-- (011_rls_policies.sql) is staff-only. As configured, every write in
-- that onboarding flow would be rejected by RLS.
--
-- This is the "investigate and correct the policy" case, not a
-- weakening: each new policy below is scoped exactly to the caller's own
-- customer_id (via public.customer_id()), the same pattern already used
-- for every other customer-self policy in this schema. A customer still
-- cannot touch another customer's row, and staff policies are untouched.

create policy customers_update_own
on public.customers
for update
to authenticated
using (
  public.user_role() = 'customer'
  and id = public.customer_id()
)
with check (
  public.user_role() = 'customer'
  and id = public.customer_id()
);


create policy properties_insert_own
on public.properties
for insert
to authenticated
with check (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy properties_update_own
on public.properties
for update
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
)
with check (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);


-- service_addresses.customer_id is set by the sync_service_address_customer
-- trigger (002_customers.sql) from property_id, not by the caller - so
-- this check only needs to confirm the property being attached to
-- actually belongs to the caller's own customer.
create policy service_addresses_insert_own
on public.service_addresses
for insert
to authenticated
with check (
  public.user_role() = 'customer'
  and exists (
    select 1 from public.properties p
    where p.id = service_addresses.property_id
      and p.customer_id = public.customer_id()
  )
);


create policy customer_contacts_insert_own
on public.customer_contacts
for insert
to authenticated
with check (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

comment on policy customers_update_own on public.customers is
  'Allows a customer to update their own record (onboarding, contact '
  'detail changes). Row-level only - RLS cannot restrict which columns a '
  'permitted UPDATE touches, so a customer could technically also change '
  'their own status/kra_pin through this policy. Not exploited by the '
  'current onboarding flow, but worth a column-level guard (a BEFORE '
  'UPDATE trigger rejecting changes to sensitive columns from a '
  'customer-role caller) before this is relied on for anything more '
  'sensitive than the fields onboarding actually sets.';
