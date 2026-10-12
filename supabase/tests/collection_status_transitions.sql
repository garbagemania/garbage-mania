-- supabase/tests/collection_status_transitions.sql
-- Requires the pgtap extension. Run via: supabase test db
-- NOT executed in the sandbox this was written in (no local Postgres) -
-- see MIGRATION_REVIEW.md.

begin;
select plan(4);

-- Minimal fixture: customer -> property -> service address -> request, enough
-- to create a single collections row to test transitions against.
-- collections_check requires every collection to originate from EXACTLY ONE of
-- a subscription or a one-off collection request, so the fixture uses a
-- request. Created and rolled back inside this transaction.

insert into public.customers (id, customer_type, display_name)
values ('11111111-1111-1111-1111-111111111111', 'individual', 'Test Customer');

insert into public.properties (id, customer_id, property_type, address_line)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'residential', '123 Test Rd');

insert into public.service_addresses (id, property_id, label)
values ('33333333-3333-3333-3333-333333333333',
        '22222222-2222-2222-2222-222222222222', 'Front gate');

insert into public.waste_collection_requests (id, customer_id, service_address_id, waste_type, requested_date)
values ('55555555-5555-5555-5555-555555555555',
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333', 'general', current_date);

insert into public.collections (id, service_address_id, collection_request_id, scheduled_date, status)
values ('44444444-4444-4444-4444-444444444444',
        '33333333-3333-3333-3333-333333333333',
        '55555555-5555-5555-5555-555555555555', current_date, 'scheduled');

-- 1. Legal transition (scheduled -> assigned) succeeds.
select lives_ok(
  $$ update public.collections set status = 'assigned' where id = '44444444-4444-4444-4444-444444444444' $$,
  'scheduled -> assigned is a legal transition'
);

-- 2. Illegal transition (assigned -> completed, skipping in_progress) is rejected.
select throws_ok(
  $$ update public.collections set status = 'completed' where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514',
  null,
  'assigned -> completed is rejected (must pass through in_progress)'
);

-- 3. Cancellation from 'assigned' is legal (Decision 7).
select lives_ok(
  $$ update public.collections set status = 'cancelled' where id = '44444444-4444-4444-4444-444444444444' $$,
  'assigned -> cancelled is a legal transition (Decision 7)'
);

-- 4. 'cancelled' is terminal - no further transition is legal.
select throws_ok(
  $$ update public.collections set status = 'assigned' where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514',
  null,
  'cancelled -> assigned is rejected (cancelled is terminal)'
);

select * from finish();
rollback;
