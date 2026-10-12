-- supabase/tests/customer_signup_approval.sql
-- NOT executed when written (no local Postgres in the authoring sandbox).
-- Run with `supabase test db`. Uses the same tests.authenticate_as() helper
-- assumption as rls_customer_isolation.sql.

begin;
select plan(9);

-- Fixture: a super admin and a self-signup customer (created through the real
-- trigger by inserting into auth.users with form metadata).
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-0000000000a1', 'boss@example.com', '{"provisioning":"staff"}'),
  ('a0000000-0000-0000-0000-0000000000c1', 'new@example.com',
   '{"customer_type":"corporate","full_name":"Test Co","phone_primary":"0712345678","phone_secondary":"0722345678",
     "county":"Nairobi","ward":"Upper Hill","house_number":"58","requested_services":["Garbage Collection"],
     "service_days":[1,4],"billing_cycle":"monthly","caretaker_name":"John"}');

insert into public.profiles (id, role_id, kind, full_name) values
  ('a0000000-0000-0000-0000-0000000000a1', (select id from public.roles where code = 'super_admin'), 'staff', 'Boss');

select is(
  (select approval_status::text from public.customers where display_name = 'Test Co'),
  'pending',
  'self-signup creates a PENDING customer'
);

select is(
  (select count(*)::int from public.customer_signup_requests where name = 'Test Co'),
  1,
  'self-signup records the signup request'
);

select ok(
  exists (select 1 from public.service_addresses sa join public.customers c on c.id = sa.customer_id where c.display_name = 'Test Co')
  and (select count(*) from public.customer_contacts cc join public.customers c on c.id = cc.customer_id where c.display_name = 'Test Co') >= 3,
  'self-signup creates the first service address and primary/secondary/caretaker contacts'
);

-- As the pending customer.
select tests.authenticate_as('a0000000-0000-0000-0000-0000000000c1');

select is(public.customer_id(), null::uuid, 'pending customer: customer_id() resolves to nothing');
select is(public.customer_approval_status(), 'pending', 'pending customer can read their own approval status');
-- RLS hides a pending customer's own customers row (customer_id() is NULL), so
-- the UPDATE matches zero rows - it cannot approve anyone, and the
-- guard_customer_approval_change trigger is a second line of defence.
-- (A data-modifying WITH is only legal at the top level of a statement, so the
-- CTE wraps the pgTAP call rather than sitting inside a sub-select.)
with u as (update public.customers set approval_status = 'approved' where true returning 1)
select is(
  (select count(*)::int from u),
  0,
  'pending customer cannot approve themselves'
);
select throws_ok(
  $$ select public.review_customer_signup((select id from public.customers where display_name = 'Test Co'), true) $$,
  '42501',
  null,
  'a customer cannot call review_customer_signup()'
);

-- As the super admin.
select tests.authenticate_as('a0000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$ select public.review_customer_signup((select id from public.customers where display_name = 'Test Co'), true, 'ok') $$,
  'super admin can approve'
);

select tests.authenticate_as('a0000000-0000-0000-0000-0000000000c1');
select isnt(public.customer_id(), null::uuid, 'after approval customer_id() resolves to the customer');

select * from finish();
rollback;
