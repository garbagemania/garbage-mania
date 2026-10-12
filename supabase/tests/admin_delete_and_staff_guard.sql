-- supabase/tests/admin_delete_and_staff_guard.sql
-- Exercises migration 022. NOT yet executed - written without a local
-- Postgres. Requires 00_test_helpers.sql. One rolled-back transaction.
begin;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'sa@example.com',  '{"provisioning":"staff"}'),
  ('a2000000-0000-0000-0000-000000000002', 'ad@example.com',  '{"provisioning":"staff"}'),
  ('a3000000-0000-0000-0000-000000000003', 'fin@example.com', '{"provisioning":"staff"}'),
  ('a4000000-0000-0000-0000-000000000004', 'new@example.com', '{"provisioning":"staff"}');

insert into public.profiles (id, role_id, kind, full_name) values
  ('a1000000-0000-0000-0000-000000000001', (select id from public.roles where code = 'super_admin'), 'staff', 'Super'),
  ('a2000000-0000-0000-0000-000000000002', (select id from public.roles where code = 'admin'),       'staff', 'Admin'),
  ('a3000000-0000-0000-0000-000000000003', (select id from public.roles where code = 'finance'),     'staff', 'Finance');
insert into public.staff_profiles (id, employee_number) values
  ('a1000000-0000-0000-0000-000000000001', 'GM-0001'),
  ('a2000000-0000-0000-0000-000000000002', 'GM-0002'),
  ('a3000000-0000-0000-0000-000000000003', 'GM-FIN-001');

insert into public.customers (id, customer_type, display_name) values
  ('c1000000-0000-0000-0000-0000000000a1', 'individual', 'Delete Test');

-- A draft invoice and a second one, created by finance.
select tests.authenticate_as('a3000000-0000-0000-0000-000000000003');
select lives_ok($$ select public.create_invoice('c1000000-0000-0000-0000-0000000000a1', current_date, current_date + 15, null, null, 'd1',
  '[{"description":"x","quantity":1,"unit_price_cents":1000,"vat_rate_bp":0}]'::jsonb) $$, 'finance can create a draft');
select throws_ok($$ select public.discard_draft_invoice((select id from public.invoices where notes = 'd1')) $$,
  '42501', null, 'finance can NOT discard (delete) a draft invoice');
select is((select count(*)::int from public.invoices where notes = 'd1'), 1, 'the draft is still there');

select tests.authenticate_as('a2000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.discard_draft_invoice((select id from public.invoices where notes = 'd1')) $$, 'admin can discard a draft invoice');
select is((select count(*)::int from public.invoices where notes = 'd1'), 0, 'the draft is gone');

-- Privilege-escalation guard on profiles.
select tests.authenticate_as('a3000000-0000-0000-0000-000000000003');
select throws_ok($$ update public.profiles set role_id = (select id from public.roles where code = 'super_admin')
  where id = 'a3000000-0000-0000-0000-000000000003' $$, '42501', null, 'finance cannot promote itself');

select tests.authenticate_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$ update public.profiles set role_id = (select id from public.roles where code = 'super_admin')
  where id = 'a2000000-0000-0000-0000-000000000002' $$, '42501', null, 'admin cannot promote itself');
select throws_ok($$ update public.profiles set status = 'suspended'
  where id = 'a3000000-0000-0000-0000-000000000003' $$, '42501', null, 'admin cannot suspend someone via direct update');
select lives_ok($$ update public.profiles set phone = '0712345678'
  where id = 'a2000000-0000-0000-0000-000000000002' $$, 'a user can still edit harmless fields on their own profile');

-- Staff management functions.
select throws_ok($$ select public.provision_staff('a4000000-0000-0000-0000-000000000004', 'New', null, 'finance', null, null, null, null) $$,
  '42501', null, 'admin cannot provision staff');

select tests.authenticate_as('a1000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.provision_staff('a4000000-0000-0000-0000-000000000004', 'New Person', null, 'operations_manager', null, null, null, null) $$,
  'super admin can provision staff');
select is((select employee_number from public.staff_profiles where id = 'a4000000-0000-0000-0000-000000000004'), 'GM-0003',
  'employee number auto-assigned (GM-FIN-001 is ignored)');
select throws_ok($$ select public.set_staff_role('a1000000-0000-0000-0000-000000000001', 'admin', null, null) $$,
  '42501', null, 'super admin cannot change their own role');
select throws_ok($$ select public.set_staff_status('a1000000-0000-0000-0000-000000000001', true) $$,
  '42501', null, 'super admin cannot suspend themselves');
select lives_ok($$ select public.set_staff_status('a4000000-0000-0000-0000-000000000004', true) $$, 'super admin can suspend another staff member');
select is((select status::text from public.profiles where id = 'a4000000-0000-0000-0000-000000000004'), 'suspended', 'status is suspended');

select * from finish();
rollback;
