-- supabase/tests/finance_engine.sql
-- Exercises migration 021 (finance engine). NOT yet executed - written without
-- a local Postgres. Requires supabase/tests/00_test_helpers.sql
-- (tests.authenticate_as). Everything runs in one rolled-back transaction.
begin;
select plan(74);

insert into public.customers (id, customer_type, display_name) values
  ('c1000000-0000-0000-0000-000000000001', 'individual', 'Finance Test Customer'),
  ('c2000000-0000-0000-0000-000000000002', 'individual', 'Other Customer');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-0000-0000-000000000001',  'fin@example.com',  '{"provisioning":"staff"}'),
  ('f2000000-0000-0000-0000-000000000002', 'sa@example.com',   '{"provisioning":"staff"}'),
  ('e1000000-0000-0000-0000-000000000001', 'cust1@example.com','{"provisioning":"staff"}'),
  ('e2000000-0000-0000-0000-000000000002', 'cust2@example.com','{"provisioning":"staff"}');

insert into public.profiles (id, role_id, kind, full_name) values
  ('f1000000-0000-0000-0000-000000000001',  (select id from public.roles where code = 'finance'),     'staff',    'Finance User'),
  ('f2000000-0000-0000-0000-000000000002', (select id from public.roles where code = 'super_admin'), 'staff',    'Super Admin'),
  ('e1000000-0000-0000-0000-000000000001', (select id from public.roles where code = 'customer'),    'customer', 'Login 1'),
  ('e2000000-0000-0000-0000-000000000002', (select id from public.roles where code = 'customer'),    'customer', 'Login 2');

insert into public.customer_profiles (id, customer_id, is_primary_contact) values
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', true),
  ('e2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', true);

select tests.authenticate_as('f1000000-0000-0000-0000-000000000001');

-- An invoice for another customer, used for isolation checks.
select lives_ok($$ select public.create_invoice('c2000000-0000-0000-0000-000000000002', current_date, current_date + 15, null, null, 'inv-c2',
  '[{"description":"Other","quantity":1,"unit_price_cents":1000,"vat_rate_bp":0}]'::jsonb) $$, 'finance can create a draft invoice');
select lives_ok($$ select public.issue_invoice((select id from public.invoices where notes = 'inv-c2')) $$, 'finance can issue it');
select lives_ok($$ select public.create_invoice('c1000000-0000-0000-0000-000000000001', current_date, current_date + 15, null, null, 'inv-1',
  '[{"description":"Garbage Collection","quantity":2,"unit_price_cents":5000,"vat_rate_bp":1600},{"description":"Bags","quantity":1,"unit_price_cents":2500,"vat_rate_bp":0}]'::jsonb) $$, 'create a two-line draft invoice');
select is((select total_cents from public.invoices where notes = 'inv-1'), 14100::bigint, 'server computes subtotal 12500 + VAT 1600 = 14100');
select is((select tax_cents from public.invoices where notes = 'inv-1'), 1600::bigint, 'VAT is stored separately');
select is((select status::text from public.invoices where notes = 'inv-1'), 'draft', 'new invoice is a draft');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), 0::bigint, 'a draft invoice does not affect the customer balance');
select lives_ok($$ select public.issue_invoice((select id from public.invoices where notes = 'inv-1')) $$, 'issuing a draft succeeds');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), 14100::bigint, 'issuing posts a receivable debit equal to the invoice total');
select throws_ok($$ select public.issue_invoice((select id from public.invoices where notes = 'inv-1')) $$, 'P0001', null, 'an invoice cannot be issued twice');
select is((select coalesce(sum(case entry_type when 'debit' then amount_cents else -amount_cents end), 0)::bigint from public.ledger_entries where customer_id = 'c1000000-0000-0000-0000-000000000001'), 0::bigint, 'ledger transactions balance across all accounts');
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.create_invoice('c1000000-0000-0000-0000-000000000001', current_date, current_date + 15, null, null, 'x', '[{"description":"x","quantity":1,"unit_price_cents":100}]'::jsonb) $$, '42501', null, 'a customer cannot create invoices');
select throws_ok($$ select public.finance_summary(current_date, current_date) $$, '42501', null, 'a customer cannot read finance summary');
select tests.authenticate_as('f1000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.record_payment('c1000000-0000-0000-0000-000000000001', 'cheque', 6000, now(), null, 'chq-1', null, '{"cheque_number":"000123","bank_name":"KCB"}'::jsonb) $$, 'record a cheque payment');
select is((select status::text from public.payments where notes = 'chq-1'), 'pending', 'a cheque starts as pending verification');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), 14100::bigint, 'a pending cheque does NOT reduce the customer balance');
select lives_ok($$ select public.verify_payment((select id from public.payments where notes = 'chq-1'), true, 'cleared in bank') $$, 'finance verifies the cheque');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), 8100::bigint, 'a verified cheque credits the ledger');
select is((select status::text from public.cheque_payments where cheque_number = '000123'), 'cleared', 'cheque record is marked cleared');
select is((select count(*)::int from public.receipts where payment_id = (select id from public.payments where notes = 'chq-1')), 1, 'verification issues one receipt');
select throws_ok($$ select public.verify_payment((select id from public.payments where notes = 'chq-1'), true, null) $$, 'P0001', null, 'a verified payment cannot be verified again');
select lives_ok($$ select public.allocate_payment((select id from public.payments where notes = 'chq-1'), (select id from public.invoices where notes = 'inv-1'), 6000) $$, 'allocate the cheque to the invoice');
select is((select status::text from public.invoices where notes = 'inv-1'), 'partially_paid', 'invoice becomes partially paid');
select is((select outstanding_cents from public.invoice_balances where invoice_id = (select id from public.invoices where notes = 'inv-1')), 8100::bigint, 'outstanding is 14100 - 6000');
select throws_ok($$ select public.allocate_payment((select id from public.payments where notes = 'chq-1'), (select id from public.invoices where notes = 'inv-1'), 1) $$, 'P0001', null, 'cannot allocate more than the payment amount');
select lives_ok($$ select public.record_payment('c1000000-0000-0000-0000-000000000001', 'bank_transfer', 9000, now(), 'BANK-1', 'pay-2', null, null) $$, 'record a bank transfer');
select throws_ok($$ select public.record_payment('c1000000-0000-0000-0000-000000000001', 'bank_transfer', 100, now(), 'BANK-1', 'dup', null, null) $$, '23505', null, 'the same external reference cannot be recorded twice');
select throws_ok($$ select public.allocate_payment((select id from public.payments where notes = 'pay-2'), (select id from public.invoices where notes = 'inv-1'), 100) $$, 'P0001', null, 'an unverified payment cannot be allocated');
select lives_ok($$ select public.verify_payment((select id from public.payments where notes = 'pay-2'), true, null) $$, 'verify the bank transfer');
select throws_ok($$ select public.allocate_payment((select id from public.payments where notes = 'pay-2'), (select id from public.invoices where notes = 'inv-1'), 9000) $$, 'P0001', null, 'cannot allocate more than the invoice outstanding');
select lives_ok($$ select public.allocate_payment((select id from public.payments where notes = 'pay-2'), (select id from public.invoices where notes = 'inv-1'), 8100) $$, 'allocate the exact outstanding amount');
select is((select status::text from public.invoices where notes = 'inv-1'), 'paid', 'invoice becomes paid');
select is((select unallocated_cents from public.payment_allocation_status where payment_id = (select id from public.payments where notes = 'pay-2')), 900::bigint, 'the remainder stays unallocated');
select is((select allocation_status from public.payment_allocation_status where payment_id = (select id from public.payments where notes = 'pay-2')), 'partially_allocated', 'allocation status is reported');
select lives_ok($$ select public.record_payment('c1000000-0000-0000-0000-000000000001', 'cheque', 4000, now(), null, 'chq-2', null, '{"cheque_number":"000124","bank_name":"KCB"}'::jsonb) $$, 'record a second cheque');
select throws_ok($$ select public.verify_payment((select id from public.payments where notes = 'chq-2'), false, null) $$, 'P0001', null, 'rejecting a cheque requires a reason');
select lives_ok($$ select public.verify_payment((select id from public.payments where notes = 'chq-2'), false, 'bounced') $$, 'reject the cheque');
select is((select status::text from public.payments where notes = 'chq-2'), 'failed', 'a rejected cheque is marked failed');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), -900::bigint, 'a rejected cheque leaves the balance untouched (14100 - 6000 - 9000)');
select lives_ok($$ select public.create_invoice('c1000000-0000-0000-0000-000000000001', current_date - 30, current_date - 10, null, null, 'inv-2',
  '[{"description":"Waste Management","quantity":1,"unit_price_cents":10000,"vat_rate_bp":0}]'::jsonb) $$, 'create a back-dated invoice');
select lives_ok($$ select public.issue_invoice((select id from public.invoices where notes = 'inv-2')) $$, 'issue it');
select ok((select is_overdue from public.invoice_balances where invoice_id = (select id from public.invoices where notes = 'inv-2')), 'an unpaid invoice past its due date is overdue');
select ok((select days_overdue from public.invoice_balances where invoice_id = (select id from public.invoices where notes = 'inv-2')) >= 10, 'days overdue is derived from the due date');
select is(((public.finance_summary(current_date, current_date)) ->> 'overdue_count')::int, 1, 'dashboard overdue count comes from the database');
select throws_ok($$ select public.issue_credit_note((select id from public.invoices where notes = 'inv-2'), null, 10001, 0, 'too much') $$, 'P0001', null, 'credit notes cannot exceed the invoice total');
select lives_ok($$ select public.issue_credit_note((select id from public.invoices where notes = 'inv-2'), null, 2000, 0, 'service not delivered') $$, 'issue a credit note');
select is((select outstanding_cents from public.invoice_balances where invoice_id = (select id from public.invoices where notes = 'inv-2')), 8000::bigint, 'a credit note reduces the invoice outstanding');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), 7100::bigint, 'a credit note posts a ledger credit');
select throws_ok($$ select public.create_debit_adjustment('c1000000-0000-0000-0000-000000000001', 500, '  ', null, null, null) $$, 'P0001', null, 'a debit adjustment requires a reason');
select lives_ok($$ select public.create_debit_adjustment('c1000000-0000-0000-0000-000000000001', 500, 'late fee', 'REF-1', null, null) $$, 'create a debit adjustment');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), 7600::bigint, 'a debit adjustment increases the balance');
select throws_ok($$ select public.request_refund((select id from public.payments where notes = 'pay-2'), 20000, 'bank_transfer', 'too much') $$, 'P0001', null, 'a refund cannot exceed the payment');
select lives_ok($$ select public.request_refund((select id from public.payments where notes = 'pay-2'), 900, 'bank_transfer', 'overpayment') $$, 'request a refund');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), 7600::bigint, 'a pending refund does not touch the ledger');
select throws_ok($$ select public.approve_refund((select id from public.refund_payouts limit 1)) $$, '42501', null, 'the requester cannot approve their own refund');
select tests.authenticate_as('f2000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.approve_refund((select id from public.refund_payouts limit 1)) $$, 'a super admin approves it');
select throws_ok($$ select public.complete_refund((select id from public.refund_payouts limit 1), '') $$, 'P0001', null, 'completing needs the payout reference');
select lives_ok($$ select public.complete_refund((select id from public.refund_payouts limit 1), 'TRX-9') $$, 'complete the refund');
select tests.authenticate_as('f1000000-0000-0000-0000-000000000001');
select is(public.get_customer_balance('c1000000-0000-0000-0000-000000000001'), 8500::bigint, 'a completed refund posts to the ledger');
select is(((public.get_account_statement('c1000000-0000-0000-0000-000000000001')) ->> 'closing_balance_cents')::bigint, 8500::bigint, 'statement closing balance equals the ledger balance');
select ok(jsonb_array_length((public.get_account_statement('c1000000-0000-0000-0000-000000000001')) -> 'rows') > 0, 'statement lists ledger rows');
select throws_ok($$ insert into public.ledger_entries (customer_id, financial_transaction_id, entry_type, amount_cents, description) values ('c1000000-0000-0000-0000-000000000001', gen_random_uuid(), 'debit', 1, 'forged') $$, '42501', null, 'finance cannot write ledger rows directly');
with u as (update public.payments set status = 'reversed' returning 1)
select is((select count(*)::int from u), 0, 'finance cannot edit payment status directly');
select throws_ok($$ select public.confirm_mpesa_payment('x', 'y', 1, '254700000000', now()) $$, '42501', null, 'M-Pesa confirmation is not callable by users');
select tests.authenticate_as('e1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.invoices where customer_id = 'c2000000-0000-0000-0000-000000000002'), 0, 'customer 1 cannot see customer 2 invoices');
select is(public.get_customer_balance(), 8500::bigint, 'a customer sees their own balance');
select throws_ok($$ select public.get_customer_balance('c2000000-0000-0000-0000-000000000002') $$, '42501', null, 'a customer cannot read another customer balance');
select is_empty($$ select 1 from public.ledger_entries $$, 'a customer cannot read the ledger');
select tests.authenticate_as('e2000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.invoices), 1, 'customer 2 sees only their own invoice');
reset role;
insert into public.mpesa_payment_intents (id, customer_id, idempotency_key, amount_cents, phone_number, checkout_request_id, status)
values ('a9000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'idem-1', 5000, '254700000000', 'ws_CO_1', 'initiated');
update public.mpesa_payment_intents set status = 'pending' where id = 'a9000000-0000-0000-0000-000000000001';
select lives_ok($$ select public.confirm_mpesa_payment('ws_CO_1', 'QWE123', 5000, '254700000000', now()) $$, 'first M-Pesa callback is processed');
select lives_ok($$ select public.confirm_mpesa_payment('ws_CO_1', 'QWE123', 5000, '254700000000', now()) $$, 'a repeated callback is accepted idempotently');
select is((select count(*)::int from public.payments where reference = 'QWE123'), 1, 'duplicate callbacks create one payment');
select is((select count(*)::int from public.mpesa_transactions where mpesa_receipt_number = 'QWE123'), 1, 'duplicate callbacks create one M-Pesa transaction');
select is((select sum(case entry_type when 'debit' then amount_cents else -amount_cents end)::bigint from public.ledger_entries where customer_id = 'c1000000-0000-0000-0000-000000000001' and ledger_account = 'receivable'), 3500::bigint, 'the ledger is credited exactly once (8500 - 5000)');

select * from finish();
rollback;
