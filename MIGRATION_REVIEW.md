# Garbage Mania — Migration Review

Status: **Migrations written, statically validated, not yet applied to a
live database.** No feature work or dashboards follow from this — per
instruction, stopping here for review.

## 1. Migrations created

| File | Domain | Tables | Enums | Notable functions |
|---|---|---|---|---|
| `000_foundation.sql` | (pre-existing) | `audit_log` | — | `set_updated_at()`, `log_audit_event()` |
| `001_identity.sql` | Identity + cross-cutting infra | `roles`, `permissions`, `role_permissions`, `profiles`, `staff_profiles`, `documents`, `status_transition_rules` | `profile_kind`, `profile_status` | `auth.user_role()`, `validate_profile_kind()`, `enforce_status_transition()` |
| `002_customers.sql` | Customers | `customers`, `customer_contacts`, `properties`, `service_addresses`, `customer_profiles` | `customer_type`, `customer_status`, `property_type`, `property_status`, `service_address_status` | `auth.customer_id()`, `sync_service_address_customer()` |
| `003_commercial.sql` | Commercial | `service_plans`, `service_plan_prices`, `contracts`, `subscriptions`, `subscription_history` | `waste_type`, `plan_frequency`, `contract_billing_terms`, `contract_status`, `subscription_status`, `subscription_change_type` | `transition_contract_status()`, `transition_subscription_status()`, `sync_subscription_customer()` |
| `004_fleet.sql` | Fleet | `vehicles`, `drivers`, `vehicle_status_history`, `maintenance_records` | `vehicle_status`, `driver_status` | — |
| `005_operations.sql` | Operations | `routes`, `route_stops`, `collection_schedules`, `waste_collection_requests`, `daily_assignments`, `driver_assignments`, `collections`, `collection_status_events`, `failed_collections`, `collection_evidence` | `collection_status`, `collection_status_reason`, `request_status`, `daily_assignment_status` | `transition_collection_status()` |
| `006_finance.sql` | Finance | `invoices`, `invoice_items`, `payments`, `payment_allocations`, `receipts`, `financial_transactions`, `ledger_entries` | `invoice_status`, `payment_method`, `payment_status`, `ledger_entry_type`, `financial_transaction_type` | `transition_invoice_status()`, `validate_payment_allocation()`, `recompute_invoice_status()`, `check_ledger_balance()`, `validate_financial_transaction_reference()`, `reject_update()`, `get_customer_statement()` |
| `007_payments.sql` | Payments | `mpesa_payment_intents`, `mpesa_transactions`, `mpesa_callback_records`, `cheque_payments`, `reconciliation_batches`, `reconciliation_items`, `refund_payouts` | `mpesa_intent_status`, `cheque_status`, `reconciliation_batch_status`, `reconciliation_match_status`, `refund_payout_status`, `refund_payout_method` | `transition_mpesa_intent_status()`, extends `validate_financial_transaction_reference()` |
| `008_documents.sql` | Documents | `customer_documents`, `staff_documents` | `customer_document_type`, `staff_document_type` | — |
| `009_communication.sql` | Communication | `notifications`, `notification_deliveries` | `notification_channel`, `notification_status`, `notification_delivery_status` | — |
| `010_system.sql` | System | `operational_events` | — | — |
| `011_rls_policies.sql` | RLS | — | — | `auth.is_assigned_driver()`, `auth.owns_service_address()`, `auth.owns_collection()`, `auth.is_assigned_driver_for_collection()`, plus ~150 `CREATE POLICY` statements |

**Totals**: 51 tables (50 new + the pre-existing `audit_log`), 35 enum
types, 3,037 lines of SQL across 12 files. Zero `INSERT` statements
against business tables — the only seed data is the six `roles` rows
(001) and the `status_transition_rules` reference rows (001), both
reference/lookup data the RBAC and state-machine enforcement literally
cannot function without, not business/demo data.

One environment fix made before writing these: `000_foundation.sql` was
renamed from `20260101000000_foundation.sql`. Supabase/Postgres migrations
apply in lexical filename order, and `"001_..."` sorts **before**
`"2026..."` as a string — so with the original timestamp filename still in
place, `001_identity.sql` would have run *before* the foundation migration
it depends on (`pgcrypto`, `set_updated_at()`, `log_audit_event()`) and
every migration after it would have failed immediately. Renamed to
`000_foundation.sql` so the whole set sorts correctly; `ARCHITECTURE.md`,
`BUSINESS_SCHEMA.md`, and `MIGRATION_PLAN.md` were updated to match.

## 2. Validation performed

**No live Postgres, Docker, or Supabase CLI is available in this sandbox**
(no network access, no `psql`/`docker`/`supabase` binaries installed) - so
"validation" here is **static analysis**, not execution. This is a real
limitation, not a formality: static checks catch ordering and reference
errors, but cannot catch everything a live `EXPLAIN`/execution would (e.g.
whether the deferred ledger-balance trigger actually behaves as intended
under a real multi-statement transaction, or how the RLS subqueries in
005 actually perform). **Running these migrations against a real local
Supabase instance (`supabase start && supabase db reset`) on your machine
is the step this cannot substitute for**, and is the natural next action
before anything gets deployed.

What was actually checked, via a custom Python static-analysis script
(`/home/claude/checks/validate_migrations.py`, not part of the repo -
sandbox-only tooling) plus manual spot checks:

1. **Migration dependency order**: every file's foreign keys, enum usages,
   and `execute function` references resolve to something defined in that
   same file or an earlier one, with the one documented exception (the
   `collections` ↔ `waste_collection_requests` circular FK in 005, closed
   via a deferred `ALTER TABLE ADD CONSTRAINT` after both tables exist).
   **Result: no ordering violations found.**
2. **Every FK target exists**: scanned all `references public.X(...)`
   clauses against the set of tables actually created. **Result: none
   dangling.**
3. **Unique constraints**: 23 unique constraints/indexes across the set
   (business identifiers like `invoice_number`/`contract_number`/
   `receipt_number`/`mpesa_receipt_number`, the partial "one current
   price per plan" and "one active driver leg" indexes, etc.) - spot-read
   individually, consistent with `BUSINESS_SCHEMA.md`/`MIGRATION_PLAN.md`.
4. **Check constraints**: 13 table-level `CHECK`s plus column-level ones
   (non-negative money/quantity columns, date-range sanity, the invoice
   `total = subtotal + tax` identity, the invoice-item
   `amount = quantity × unit_price` identity, the "exactly one of
   subscription_id/collection_request_id" collection constraint, the
   "notes required for adjustment/write_off" financial_transactions
   constraint) - each read against its source rule in
   `BUSINESS_SCHEMA.md`/`MIGRATION_PLAN.md`.
5. **Triggers**: 80 `CREATE TRIGGER` statements; every one's
   `execute function` target confirmed to exist (either defined earlier in
   the same migration set, or `set_updated_at()`/`log_audit_event()` from
   the pre-existing foundation migration). **Result: none dangling.**
6. **SECURITY DEFINER search_path**: every `SECURITY DEFINER` function in
   the set (`auth.user_role()`, `auth.customer_id()`,
   `auth.is_assigned_driver()`, `auth.owns_service_address()`,
   `auth.owns_collection()`, `auth.is_assigned_driver_for_collection()`,
   plus `log_audit_event()` from the foundation migration) has an explicit
   `SET search_path`. **Result: 7/7 pinned, none missing.**
7. **RLS enabled on every table**: all 51 tables (50 new + `audit_log`)
   confirmed to have `ENABLE ROW LEVEL SECURITY`. **Result: 51/51.**
8. **FORCE ROW LEVEL SECURITY on financial tables**: confirmed set on
   exactly the 13 tables `BUSINESS_SCHEMA.md` §D calls the "strictest
   domain" (`invoices`, `invoice_items`, `payments`,
   `payment_allocations`, `receipts`, `financial_transactions`,
   `ledger_entries`, `mpesa_payment_intents`, `mpesa_transactions`,
   `mpesa_callback_records`, `cheque_payments`,
   `reconciliation_batches`, `reconciliation_items`, `refund_payouts`) -
   14, not 13 (recount: the finance list is 7, the payments list is 7,
   total 14). **Result: exactly that set, no more, no fewer.**
9. **Every table has at least one RLS policy**: confirmed 51/51 tables
   referenced by at least one `CREATE POLICY` in `011_rls_policies.sql` -
   none silently deny-all by omission.
10. **Service-role workflows remain possible without exposing service
    credentials** (item 10 of the request) - confirmed by design, not by
    execution:
    - Supabase's `service_role` Postgres role carries `BYPASSRLS`, which
      overrides RLS **regardless of `FORCE ROW LEVEL SECURITY`** - so the
      forced-RLS finance/payments tables are still fully writable by
      server-side background jobs (M-Pesa reconciliation, statement
      generation, notification dispatch) using
      `createSupabaseServiceRoleClient()` (already in the foundation
      code), without any RLS policy needing to grant them access and
      without the service-role key ever reaching client code.
    - `audit_log` writes (via `log_audit_event()`, `SECURITY DEFINER`) and
      `financial_transactions`/`ledger_entries` writes triggered by an
      ordinary customer/staff action succeed via **table-owner RLS
      bypass** (the function runs as its owner, who also owns the table;
      `audit_log` has `ENABLE` but not `FORCE` row level security, so
      owner bypass applies) - meaning regular user actions get audited
      correctly without needing an `INSERT` policy on `audit_log` for
      every role.
    - `operational_events` and `notification_deliveries` have **no
      INSERT policy for any authenticated role at all** - by design, only
      the service-role client (background jobs) can write to them.
11. **Vitest suite**: attempted (`npm test`). **Failed immediately -
    `vitest: not found`.** This sandbox has no `node_modules` (no network
    access to `npm install` here), so this is an environment limitation,
    not a test failure - **the suite was not actually exercised.** Run
    `npm test` on your machine (where `npm install` already succeeded) to
    get a real result; nothing in these migrations changes any existing
    frontend code or test file, so there's no reason to expect the
    existing suite's result to change, but that's an expectation, not a
    verified outcome.
12. **Database/RLS tests added**: three pgTAP test files in
    `supabase/tests/` (see §4) - **not executed** in this sandbox for the
    same reason as #11 (no local Postgres/pgTAP). Run via `supabase test
    db` once Supabase is running locally.

## 3. Decisions implemented (recap, so this review is legible standalone)

- **Status-transition enforcement extended to five state machines**
  (`collections`, `invoices`, `subscriptions`, `contracts`,
  `mpesa_payment_intents`), via one generic `status_transition_rules`
  reference table + one generic `enforce_status_transition()` trigger
  function (001), attached per-table in each domain's own migration, plus
  a per-entity atomic transition function
  (`transition_collection_status()`, `transition_invoice_status()`,
  `transition_subscription_status()`, `transition_contract_status()`,
  `transition_mpesa_intent_status()`) as the recommended application-facing
  call site. Concurrency safety relies on Postgres's native row-level
  locking for `UPDATE` (a second concurrent writer blocks behind the
  first, then re-evaluates against the committed row) - no additional
  locking was needed for the transition trigger itself, though
  `validate_payment_allocation()` and `recompute_invoice_status()` (006)
  additionally take explicit `FOR UPDATE` row locks, since their
  correctness depends on an aggregate over sibling rows, not just the
  single row being updated.
- **`financial_transactions.reference_id` stays polymorphic.** A
  `BEFORE INSERT` trigger (`validate_financial_transaction_reference()`,
  006, extended in 007 via `CREATE OR REPLACE` once `refund_payouts`
  exists) checks that the referenced row actually exists for each
  supported `reference_table` value. **Documented limitation** (per the
  decision's explicit instruction): this is a one-time existence check at
  `INSERT`, not an ongoing FK guarantee - if a referenced `invoices`/
  `payments`/`refund_payouts` row were later deleted, nothing here would
  cascade or prevent that. In practice this schema never hard-deletes
  those rows through normal application flow, so the gap is narrow, but
  it is real and is called out in a `COMMENT ON COLUMN` in the migration
  itself, not just here.
- **`collection_status_reason` is a closed enum**
  (`gate_locked`, `customer_absent`, `bin_not_out`, `customer_cancelled`,
  `operational_cancelled`, `weather`, `vehicle_issue`, `other`), used by
  both `collection_status_events.reason_code` and
  `failed_collections.reason_code`.

## 4. Database/RLS tests added

`supabase/tests/`:
- `collection_status_transitions.sql` - asserts a legal transition
  succeeds, an illegal one is rejected with `23514`, cancellation from
  `assigned` succeeds (Decision 7), and `cancelled` is terminal.
- `rls_customer_isolation.sql` - asserts Customer A cannot see Customer
  B's invoices, and that neither can read `ledger_entries` at all
  (Decision 9).
- `ledger_balance_invariant.sql` - asserts a balanced debit/credit pair is
  accepted and an unbalanced insert is rejected once constraints are
  checked.

None of these were run (see §2.12). `rls_customer_isolation.sql` also
assumes a `tests.authenticate_as()` helper (from the common Supabase
pgTAP test-helpers extension) that **is not part of this migration set**
- it needs to be installed separately before that test file will even
parse correctly. `ledger_balance_invariant.sql` inserts a
`financial_transactions` row with a random, non-existent `reference_id`,
which `validate_financial_transaction_reference()` will reject - that
test needs a real `invoices` fixture row wired in before it will actually
run; flagged inline in the file itself, not silently left broken.

## 5. Unresolved issues

1. **None of the twelve files have been applied to a real database.**
   Static analysis is not a substitute for `supabase db reset` actually
   succeeding - the next concrete action, before any application code
   changes, should be running that on a machine with Docker/Supabase CLI
   available and confirming it completes without error.
2. **`transition_subscription_status()`'s change-type inference is
   approximate.** It picks `subscription_history.change_type` from the
   *new* status alone (`active` → `'resumed'`, `paused` → `'paused'`,
   `cancelled` → `'cancelled'`, else `'plan_changed'`) - so a
   `pending → active` transition (a brand-new subscription activating for
   the first time) gets logged as `'resumed'`, which is a slightly odd
   read of "resumed" for something that was never paused. Not incorrect
   per the enum's available values, but worth a second look before this
   ships; the cleanest fix is passing the desired `change_type` in as a
   parameter instead of inferring it, at the cost of a slightly larger
   function signature.
3. **RLS policy performance under real data volume is unverified**, per
   `MIGRATION_PLAN.md` §7.9 - the driver/customer ownership subqueries in
   005 (`auth.is_assigned_driver_for_collection()` and friends) are
   `EXISTS` joins, not flat column comparisons. The indexes that should
   support them exist, but an actual `EXPLAIN ANALYZE` against realistic
   data is the only way to confirm that, and this sandbox has no database
   to run one against.
4. **The `documents` INSERT policy is permissive** (any authenticated
   user can insert a `documents` row with `uploaded_by = auth.uid()`,
   including a `customer`-role caller) - intentional, so a customer can
   upload their own ID/KRA PIN copy directly, but it means a document row
   can exist with no `customer_documents`/`staff_documents`/
   `collection_evidence` link yet at all (those are separate inserts).
   Not a security hole (an orphaned, unlinked document is only visible to
   staff and its own uploader per the `documents` SELECT policies), but
   worth knowing the data model allows a document to briefly (or
   permanently, if the app has a bug) exist unlinked.

## 6. Assumptions

1. **Creating functions in the `auth` schema is permitted for the
   migration-applying role.** `auth.user_role()`, `auth.customer_id()`,
   and the four RLS-helper functions in 011 are all created in the `auth`
   schema, per Decision 3's explicit naming. This is a common Supabase
   pattern and is expected to work via the Supabase CLI's migration role
   on a standard project, but **it has not been verified against a live
   Supabase project in this session** - see §7 below; this is the single
   most important thing to confirm before treating this migration set as
   deployable.
2. **`documents` living in `001_identity.sql` rather than
   `008_documents.sql`** (and `customer_profiles` living in
   `002_customers.sql` rather than `001`) are treated as settled by
   `MIGRATION_PLAN.md` §0, not re-litigated here - both were flagged
   there and not objected to.
3. **Application code has not been touched.** Decision 1 approved
   updating `src/types/roles.ts`, `AREA_ACCESS`, `src/middleware.ts`, and
   RBAC helpers to the six-role model, and Decision 3 approved moving RLS
   authority to `profiles` - but the instructions for *this* task were
   explicitly migrations-only ("do NOT immediately modify application
   features"). The application code still reads role from
   `app_metadata.role` in the JWT and still uses the old nine-role model.
   **This is now a real inconsistency between the database and the app**,
   not just a documented future step - the app will not correctly
   authorize anyone against this schema until that follow-up lands.
4. **`roles` has no CHECK constraint restricting it to exactly six
   codes.** Kept deliberately open (per its own original design rationale
   in `BUSINESS_SCHEMA.md`: "a real table, not an enum, specifically so a
   new role doesn't require a migration") - so nothing in the database
   itself prevents inserting a seventh role. Application code (once
   updated per Decision 1) is what enforces "these are the six roles" in
   practice, via `AREA_ACCESS`/`roleCanAccess`, not the schema.
5. **`transition_*` functions default to `SECURITY INVOKER`** (i.e., no
   `SECURITY DEFINER` was added), meaning they run under the calling
   user's RLS, not elevated privilege. This was a deliberate choice
   consistent with Decision 3 ("Database RLS must remain authoritative") -
   a driver calling `transition_collection_status()` only succeeds because
   the `collections_update_driver_own` and
   `collection_status_events_insert_driver_own` policies in 011 permit it
   for their own assigned collection, not because the function bypasses
   RLS. If a role's RLS policy and its intended capability ever disagree,
   the RLS policy wins and the function fails with a policy-violation
   error rather than a friendlier one - flagged as a trade-off, not a bug.

## 7. Database behavior requiring manual Supabase configuration

1. **`auth` schema function creation permissions** (see §6.1) - confirm
   the role `supabase db push`/`supabase migration up` runs as on your
   target project actually has `CREATE` on the `auth` schema before
   relying on this in production. If it doesn't, the fix is mechanical
   (move `auth.user_role()`, `auth.customer_id()`, and the four 011
   helpers to `public` schema, e.g. `public.current_role()`, and update
   every policy/function that calls them) but is real rework, not a
   one-line change, so worth confirming early rather than discovering it
   mid-deploy.
2. **`pgtap` extension** is not installed by any migration here - it's
   needed for `supabase/tests/*.sql` to run at all via `supabase test db`.
   Enable it locally (`create extension if not exists pgtap;`, typically
   handled by `supabase test db` itself) before running the test suite.
3. **Supabase test helpers** (for `tests.authenticate_as(...)` used in
   `rls_customer_isolation.sql`) are a separate, commonly-used Supabase
   community package, not part of this migration set - install separately
   if you want that specific test to run as written, or rewrite it to set
   `request.jwt.claims`/`role` directly.
4. **Realtime**: nothing in this migration set enables Supabase Realtime
   publications for any table. If the driver/dispatch UI is meant to get
   live updates (per the original brief's "real-time synchronization"
   requirement), the relevant tables (`collections`, `daily_assignments`,
   `driver_assignments` are the obvious candidates) need to be added to
   the `supabase_realtime` publication - not done here, and not implied
   by anything in `BUSINESS_SCHEMA.md`/`MIGRATION_PLAN.md` either, so
   flagging it as a gap rather than a silent omission.
5. **Storage buckets**: `documents.storage_path` assumes Supabase Storage
   buckets exist for uploaded files (contracts, collection evidence
   photos, staff licenses) - no bucket creation or storage-level RLS
   policy is part of this SQL migration set (Supabase Storage policies are
   configured separately from table RLS). Needs manual setup before file
   upload actually works end-to-end.
6. **M-Pesa Daraja credentials/webhook URL** and **Africa's Talking (or
   equivalent SMS provider) credentials** are application/environment
   configuration, not database configuration - out of scope for this
   review, noted only so it isn't mistaken for something this migration
   set was supposed to cover.

---

**Stopping here, as instructed.** Next actions, in order: (1) run
`supabase start && supabase db reset` locally against Docker to get real
execution validation this sandbox couldn't provide, (2) resolve
§7.1 (the `auth` schema permission question) before treating this as
deployable, (3) only then move on to the application-code role
reconciliation from Decision 1, which is now a known inconsistency
(§6.3) - not before.
