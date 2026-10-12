-- supabase/tests/collection_request_review.sql
-- Exercises migration 023. NOT yet executed - written without a local Postgres.
begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('b1000000-0000-0000-0000-000000000001', 'ops@example.com',  '{"provisioning":"staff"}'),
  ('b2000000-0000-0000-0000-000000000002', 'fin@example.com',  '{"provisioning":"staff"}');
insert into public.profiles (id, role_id, kind, full_name) values
  ('b1000000-0000-0000-0000-000000000001', (select id from public.roles where code = 'operations_manager'), 'staff', 'Ops'),
  ('b2000000-0000-0000-0000-000000000002', (select id from public.roles where code = 'finance'),            'staff', 'Fin');
insert into public.customers (id, customer_type, display_name) values
  ('c1000000-0000-0000-0000-0000000000b1', 'individual', 'Req Customer');
-- A service address always hangs off a property; the sync_service_address_customer()
-- trigger derives service_addresses.customer_id from that property.
insert into public.properties (id, customer_id, property_type, address_line)
  values ('f1000000-0000-0000-0000-0000000000b1', 'c1000000-0000-0000-0000-0000000000b1', 'residential', '12 Test Road');
insert into public.service_addresses (id, property_id, customer_id, label, status)
  values ('d1000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-0000000000b1', 'c1000000-0000-0000-0000-0000000000b1', 'Home', 'active');
insert into public.waste_collection_requests (id, customer_id, service_address_id, waste_type, requested_date)
  values ('e1000000-0000-0000-0000-0000000000b1', 'c1000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-0000000000b1', 'general', current_date + 3),
         ('e2000000-0000-0000-0000-0000000000b2', 'c1000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-0000000000b1', 'bulky',   current_date + 3);

select tests.authenticate_as('b2000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.review_collection_request('e1000000-0000-0000-0000-0000000000b1', true, current_date + 3, null) $$,
  '42501', null, 'finance cannot review requests');

select tests.authenticate_as('b1000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.review_collection_request('e1000000-0000-0000-0000-0000000000b1', true, current_date - 1, null) $$,
  'P0001', null, 'cannot schedule in the past');
select throws_ok($$ select public.review_collection_request('e2000000-0000-0000-0000-0000000000b2', false, null, '') $$,
  'P0001', null, 'rejecting needs a reason');
select lives_ok($$ select public.review_collection_request('e1000000-0000-0000-0000-0000000000b1', true, current_date + 3, 'See you then') $$,
  'operations manager approves a request');
select is((select status::text from public.waste_collection_requests where id = 'e1000000-0000-0000-0000-0000000000b1'), 'scheduled', 'request is scheduled');
select is((select count(*)::int from public.collections where collection_request_id = 'e1000000-0000-0000-0000-0000000000b1'), 1, 'one collection was created');
select ok((select resulting_collection_id is not null from public.waste_collection_requests where id = 'e1000000-0000-0000-0000-0000000000b1'), 'request links to the collection');
select throws_ok($$ select public.review_collection_request('e1000000-0000-0000-0000-0000000000b1', true, current_date + 4, null) $$,
  'P0001', null, 'an already-reviewed request cannot be approved twice');
select lives_ok($$ select public.review_collection_request('e2000000-0000-0000-0000-0000000000b2', false, null, 'Outside our area') $$,
  'operations manager can reject with a reason');

select * from finish();
rollback;
