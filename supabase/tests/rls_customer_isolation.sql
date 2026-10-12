-- supabase/tests/rls_customer_isolation.sql
-- Requires the pgtap extension and pgtap's supabase_test_helpers (or
-- manual role/JWT claim switching - see note below). Run via:
-- supabase test db
-- NOT executed in the sandbox this was written in (no local Postgres) -
-- see MIGRATION_REVIEW.md.
--
-- This test asserts the core RLS promise for the FINANCE domain: customer
-- A can never see customer B's invoices, even though both are the
-- 'customer' role and RLS is FORCE'd on invoices.
--
-- NOTE ON ROLE SWITCHING: exercising RLS as a specific Supabase user
-- normally requires either (a) Supabase's test helpers
-- (supabase/supabase-test-helpers or similar), which stub auth.uid()/
-- auth.role() for a `set local role authenticated` session, or (b) a
-- direct `set local "request.jwt.claims"` + `set local role authenticated`
-- pair matching how PostgREST authenticates real requests. This file
-- assumes the former (a `tests.authenticate_as(profile_id)` helper) - if
-- the project doesn't have that helper installed, this test needs a
-- one-time addition of the pgTAP-adjacent Supabase test helpers first.

begin;
select plan(3);

insert into public.customers (id, customer_type, display_name) values
  ('a1111111-1111-1111-1111-111111111111', 'individual', 'Customer A'),
  ('b2222222-2222-2222-2222-222222222222', 'individual', 'Customer B');

insert into public.invoices (id, customer_id, invoice_number, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
values
  ('a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111',
   'INV-TEST-A', current_date, current_date + 15, 100000, 0, 100000, 'issued'),
  ('b4444444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222',
   'INV-TEST-B', current_date, current_date + 15, 200000, 0, 200000, 'issued');

-- Fixture users. Requires an auth.users row for each; created here only
-- for the duration of this rolled-back transaction.
-- provisioning = 'staff' tells handle_new_customer_signup() NOT to auto-create a
-- customer/profile for these auth users (015/017); this fixture creates the
-- profile and customer link explicitly below, with real names.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c5555555-5555-5555-5555-555555555555', 'login-a@example.com', '{"provisioning":"staff"}'),
  ('d6666666-6666-6666-6666-666666666666', 'login-b@example.com', '{"provisioning":"staff"}');

insert into public.profiles (id, role_id, kind, full_name) values
  ('c5555555-5555-5555-5555-555555555555',
   (select id from public.roles where code = 'customer'), 'customer', 'Login for Customer A'),
  ('d6666666-6666-6666-6666-666666666666',
   (select id from public.roles where code = 'customer'), 'customer', 'Login for Customer B');

insert into public.customer_profiles (id, customer_id, is_primary_contact) values
  ('c5555555-5555-5555-5555-555555555555', 'a1111111-1111-1111-1111-111111111111', true),
  ('d6666666-6666-6666-6666-666666666666', 'b2222222-2222-2222-2222-222222222222', true);

-- Act as Customer A's login.
select tests.authenticate_as('c5555555-5555-5555-5555-555555555555');

select results_eq(
  $$ select invoice_number from public.invoices order by invoice_number $$,
  $$ values ('INV-TEST-A') $$,
  'Customer A sees only their own invoice, not Customer B''s'
);

select is_empty(
  $$ select 1 from public.ledger_entries $$,
  'Customer A gets zero rows from ledger_entries (no policy grants customer access - Decision 9)'
);

-- Act as Customer B's login.
select tests.authenticate_as('d6666666-6666-6666-6666-666666666666');

select results_eq(
  $$ select invoice_number from public.invoices order by invoice_number $$,
  $$ values ('INV-TEST-B') $$,
  'Customer B sees only their own invoice, not Customer A''s'
);

select * from finish();
rollback;
