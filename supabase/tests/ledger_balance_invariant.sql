-- supabase/tests/ledger_balance_invariant.sql
-- Requires the pgtap extension. Run via: supabase test db
-- NOT executed in the sandbox this was written in (no local Postgres) -
-- see MIGRATION_REVIEW.md.

begin;
select plan(2);

insert into public.customers (id, customer_type, display_name)
values ('e7777777-7777-7777-7777-777777777777', 'individual', 'Ledger Test Customer');

-- financial_transactions.reference_id is polymorphic and validated by
-- validate_financial_transaction_reference(): an 'invoices' reference must point
-- at a real invoice. The fixture therefore creates one and references it.
insert into public.invoices
  (id, customer_id, invoice_number, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
values
  ('f9999999-9999-9999-9999-999999999999', 'e7777777-7777-7777-7777-777777777777',
   'INV-TEST-LEDGER', current_date, current_date + 15, 50000, 0, 50000, 'issued');

insert into public.financial_transactions
  (id, customer_id, transaction_type, reference_table, reference_id, amount_cents)
values
  ('f8888888-8888-8888-8888-888888888888',
   'e7777777-7777-7777-7777-777777777777',
   'invoice_issued', 'invoices', 'f9999999-9999-9999-9999-999999999999', 50000);

-- A balanced pair (one debit, one credit, same transaction, same amount)
-- must succeed at commit.
select lives_ok(
  $$
  insert into public.ledger_entries
    (customer_id, financial_transaction_id, entry_type, amount_cents, description)
  values
    ('e7777777-7777-7777-7777-777777777777', 'f8888888-8888-8888-8888-888888888888',
     'debit', 50000, 'test debit'),
    ('e7777777-7777-7777-7777-777777777777', 'f8888888-8888-8888-8888-888888888888',
     'credit', 50000, 'test credit')
  $$,
  'a balanced debit/credit pair for one financial_transaction_id is accepted'
);

-- An unbalanced insert (debit with no matching credit) must fail - but
-- only at COMMIT, since the constraint trigger is deferred. Inside a
-- single statement/transaction test like this, throws_ok's internal
-- transaction handling needs the deferred check forced early with
-- `set constraints all immediate` to observe the failure synchronously.
select throws_ok(
  $$
  set constraints all immediate;
  insert into public.ledger_entries
    (customer_id, financial_transaction_id, entry_type, amount_cents, description)
  values
    ('e7777777-7777-7777-7777-777777777777', 'f8888888-8888-8888-8888-888888888888',
     'debit', 10000, 'unbalanced debit with no matching credit')
  $$,
  null,
  null,
  'an unbalanced ledger_entries insert is rejected once constraints are checked'
);

select * from finish();
rollback;
