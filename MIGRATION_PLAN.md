# Garbage Mania — Migration Plan

Status: **Planning document. No migration SQL exists yet.** This sequences
`BUSINESS_SCHEMA.md`'s domain model (as revised by the approved decisions)
into the eleven migration files, in dependency order, and surfaces every
place where a strict domain-by-domain split runs into a real foreign-key or
ordering problem. Full column-level detail for every table is already in
`BUSINESS_SCHEMA.md` and is not repeated here — this document is about
**order, dependencies, and risk**, not schema content.

Everything below assumes `supabase/migrations/000_foundation.sql`
(extensions, `set_updated_at()`, `audit_log` + `log_audit_event()`) is
already applied — nothing here recreates it.

---

## 0. What changed from BUSINESS_SCHEMA.md's section order, and why

`BUSINESS_SCHEMA.md` is organized by *business domain* (IDENTITY, CUSTOMERS,
COMMERCIAL, OPERATIONS, FLEET, ...). Migration files have to be organized by
*foreign-key dependency* instead, and those two orderings don't quite match.
Three tables move out of the migration file their domain would suggest, and
one migration's position swaps relative to the schema doc's section order.
None of this changes any table's columns — only which `.sql` file creates it.

1. **`documents` moves from migration 008 into 001_identity.sql.**
   `documents` is referenced by `contracts.signed_document_id` (003),
   `collection_evidence.document_id` (005), and `receipts.document_id`
   (006) — all of which run before 008 would. Rather than defer three
   separate `ALTER TABLE ... ADD CONSTRAINT` calls to patch this after the
   fact, `documents` (the generic file registry) is created once, early, in
   001_identity.sql — the same treatment `audit_log` already got in the
   foundation migration for the same reason: it's infrastructure every
   later domain needs to point at. **008_documents.sql** then only creates
   `customer_documents` and `staff_documents` (the typed link tables) plus
   their RLS-adjacent structure. This is flagged in §7 (implementation
   risks) rather than silently done, since "documents lives in the identity
   migration" is a real deviation from the domain grouping you'd expect.

2. **`customer_profiles` moves from migration 001 into 002_customers.sql.**
   It FKs to `customers.id`, which doesn't exist until 002. Unlike
   `documents` (needed by three unrelated later domains), this dependency
   is single, direct, and one migration away — so the clean fix is just to
   create it in 002, immediately after `customers`, rather than treat it as
   cross-cutting infrastructure like `documents`. `roles`, `permissions`,
   `role_permissions`, `profiles`, and `staff_profiles` stay in 001.

3. **004_fleet.sql now runs before 005_operations.sql** — this matches the
   file list you specified, and it's *required*, not incidental:
   `routes.default_vehicle_id` and `routes.default_driver_id` FK to
   `vehicles`/`drivers`. If OPERATIONS ran before FLEET (as
   `BUSINESS_SCHEMA.md`'s §4/§5 ordering would suggest), `routes` couldn't
   be created. No action needed here — just confirming the file order
   you gave is the one that actually works, and noting why.

4. **`driver_assignments` is created in 005_operations.sql, not
   004_fleet.sql**, even though your original table list put "driver
   assignments" under FLEET. It FKs to `daily_assignments`, which is an
   OPERATIONS-domain table and doesn't exist until 005. `vehicles` and
   `drivers` (004) are both available to it by then regardless. Flagged in
   §7 since it's a direct deviation from how the table was originally
   grouped.

---

## 1. Migration dependency order

```
000_foundation.sql   (already applied — extensions, set_updated_at(), audit_log)
        │
001_identity.sql        roles, permissions, role_permissions, profiles,
        │                staff_profiles, documents, auth.user_role()
        ▼
002_customers.sql       customers, customer_contacts, properties,
        │                service_addresses, customer_profiles, auth.customer_id()
        ▼
003_commercial.sql      service_plans, service_plan_prices, contracts,
        │                subscriptions, subscription_history
        ▼
004_fleet.sql            vehicles, drivers, vehicle_status_history,
        │                maintenance_records
        ▼
005_operations.sql      routes, route_stops, collection_schedules,
        │                waste_collection_requests, daily_assignments,
        │                driver_assignments, collections,
        │                collection_status_events, failed_collections,
        │                collection_evidence
        ▼
006_finance.sql          invoices, invoice_items, payments,
        │                payment_allocations, receipts,
        │                financial_transactions, ledger_entries,
        │                customer_statement (view/RPC)
        ▼
007_payments.sql        mpesa_payment_intents, mpesa_transactions,
        │                mpesa_callback_records, cheque_payments,
        │                reconciliation_batches, reconciliation_items,
        │                refund_payouts
        ▼
008_documents.sql       customer_documents, staff_documents
        │                (documents itself already exists — see §0.1)
        ▼
009_communication.sql   notifications, notification_deliveries
        ▼
010_system.sql          operational_events
        │                (audit_log already exists — see foundation migration)
        ▼
011_rls_policies.sql    CREATE POLICY for every table above
```

Every arrow is a hard dependency (a later file's FK, trigger, or policy
needs something the earlier file created) — this is a total order, not
just a suggestion; migrations must be applied in exactly this sequence.

---

## 2. Per-migration contents

### 001_identity.sql
- **Enums**: `profile_kind` (`staff`, `customer`), `profile_status`
  (`active`, `suspended`, `disabled`).
- **Tables** (creation order): `roles` → `permissions` →
  `role_permissions` → `profiles` → `staff_profiles` → `documents`.
- **Seed data**: the six canonical role rows (`super_admin`, `admin`,
  `finance`, `operations_manager`, `driver`, `customer`) are inserted into
  `roles`. This is reference/lookup data the system cannot function
  without — not business/demo data, and not excluded by "no fake data."
  `permissions` is left empty; nothing seeds it yet (see §7.9).
- **Helper function**: `auth.user_role()` — `security definer`, reads
  `profiles.role_id → roles.code` for `auth.uid()`. Can be defined here
  because both its dependencies (`profiles`, `roles`) exist by this point.
  `auth.customer_id()` **cannot** be defined here — its dependency
  (`customer_profiles`) doesn't exist until 002.
- **Triggers**: `set_updated_at()` on `profiles`, `staff_profiles`,
  `documents`. Audit (`log_audit_event()`) on `profiles`, `staff_profiles`,
  `documents`. **Not** on `roles`/`permissions`/`role_permissions` —
  reference data, low churn, changes tracked by migration history rather
  than the audit log.
- **RLS**: `ENABLE ROW LEVEL SECURITY` on every table in this file (policy
  bodies come in 011).

### 002_customers.sql
- **Enums**: `customer_type` (`individual`, `corporate`), `customer_status`
  (`active`,`suspended`,`closed`), `property_type`
  (`residential`,`commercial`,`industrial`,`institutional`),
  `property_status` (`active`,`inactive`), `service_address_status`
  (`active`,`inactive`) — kept as separate enum types per table rather than
  one shared `active_inactive` enum reused across domains; see §7.10 for
  why.
- **Tables**: `customers` → `customer_contacts` → `properties` →
  `service_addresses` → `customer_profiles`.
- **Helper function**: `auth.customer_id()` — `security definer`, now that
  `customer_profiles` exists.
- **Trigger**: `sync_service_address_customer()` — `BEFORE INSERT OR
  UPDATE` on `service_addresses`, sets `service_addresses.customer_id` from
  `properties.customer_id` so the denormalized column (documented in
  `BUSINESS_SCHEMA.md` §2 as "kept in sync by a trigger, not app code")
  can never drift from its source.
- **Triggers**: `set_updated_at()` on all five tables. Audit on all five.
- **RLS**: enabled on all five; policies in 011.

### 003_commercial.sql
- **Enums**: `waste_type`
  (`general`,`recyclable`,`organic`,`hazardous`,`bulky`),
  `plan_frequency` (`weekly`,`biweekly`,`monthly`,`on_demand`),
  `contract_billing_terms` (`prepaid`,`net_15`,`net_30`), `contract_status`
  (`draft`,`active`,`expired`,`terminated`), `subscription_status`
  (`pending`,`active`,`paused`,`cancelled`), `subscription_change_type`
  (`created`,`plan_changed`,`paused`,`resumed`,`cancelled`,
  `address_changed`).
- **Tables**: `service_plans` → `service_plan_prices` → `contracts` →
  `subscriptions` → `subscription_history`.
- **Constraint**: partial unique index on `service_plan_prices`
  — one row with `effective_to is null` per `service_plan_id` (see §7.11
  for the race-condition note).
- **Triggers**: `set_updated_at()` on `service_plans`, `contracts`,
  `subscriptions`. Audit on `service_plans`, `contracts`, `subscriptions`.
  **Not** on `service_plan_prices` (append-only pricing history — the rows
  themselves are the record) or `subscription_history` (it *is* an audit
  trail; logging changes to a change-log is noise).
- **RLS**: enabled on all five; policies in 011.

### 004_fleet.sql
- **Enums**: `vehicle_status` (`active`,`in_maintenance`,`out_of_service`),
  `driver_status` (`active`,`suspended`,`inactive`).
- **Tables**: `vehicles` → `drivers` → `vehicle_status_history` →
  `maintenance_records`. (`vehicle_status_history.from_status`/`to_status`
  stay `text`, not enum — a status-history table should be able to record
  a value even if the live enum changes later.)
- **Triggers**: `set_updated_at()` + audit on `vehicles`, `drivers`,
  `maintenance_records`. **Not** on `vehicle_status_history` (itself a
  history table).
- **RLS**: enabled on all four; policies in 011.

### 005_operations.sql
The largest and riskiest file — see §7.1–§7.4 before writing it.
- **Enums**: `collection_status`
  (`scheduled`,`assigned`,`in_progress`,`completed`,`failed`,
  `rescheduled`,`cancelled` — **updated per Decision 7**, see §3 below),
  `collection_status_reason` (proposed new enum — see §7.13),
  `request_status` (`submitted`,`approved`,`scheduled`,`rejected`,
  `cancelled`), `daily_assignment_status`
  (`planned`,`dispatched`,`in_progress`,`completed`,`cancelled`).
- **Tables**, in an order that satisfies every FK including the circular
  one (§7.3): `routes` → `route_stops` → `collection_schedules` →
  `waste_collection_requests` (created **without** its
  `resulting_collection_id` FK constraint) → `daily_assignments` →
  `driver_assignments` → `collections` (its
  `collection_request_id → waste_collection_requests.id` FK is fine here,
  since `waste_collection_requests` already exists) → `ALTER TABLE
  waste_collection_requests ADD CONSTRAINT ... FOREIGN KEY
  (resulting_collection_id) REFERENCES collections(id)` → collection tables:
  `collection_status_events` → `failed_collections` →
  `collection_evidence`.
- **Triggers**:
  - `validate_collection_status_transition()` — `BEFORE UPDATE` on
    `collections`, rejects any transition not in the graph in §3. Does
    **not** write to `collection_status_events` itself (see §7.4).
  - `transition_collection_status(...)` — a stored procedure (not a
    trigger) that application code calls instead of a bare `UPDATE`: it
    updates `collections.status` and inserts the matching
    `collection_status_events` row (with `reason_code`) in one atomic
    call, so the two can never fall out of sync. Recommended in §7.4 as a
    stronger guarantee than "the app is supposed to do both."
  - `sync_daily_assignment_customer_denorm` — not needed; no denormalized
    customer column on operations tables beyond `service_addresses`
    already handled in 002.
  - `set_updated_at()` on `routes`, `route_stops`, `collection_schedules`,
    `waste_collection_requests`, `daily_assignments`, `collections`.
    (`driver_assignments`, `collection_status_events`,
    `failed_collections`, `collection_evidence` are insert-mostly/append
    and don't carry `updated_at`, matching `BUSINESS_SCHEMA.md`.)
  - Audit on `routes`, `route_stops`, `collection_schedules`,
    `waste_collection_requests`, `daily_assignments`,
    `driver_assignments`, `collections`, `failed_collections`. **Not** on
    `collection_status_events` (itself the domain audit trail) or
    `collection_evidence` (itself the evidentiary record, per
    `BUSINESS_SCHEMA.md`).
- **Extra constraint recommended**: partial unique index on
  `driver_assignments`, `(daily_assignment_id) where ended_at is null` — at
  most one "currently active" driver leg per assignment. Not in
  `BUSINESS_SCHEMA.md`; added here as a gap found while planning ordering
  (§7.12).
- **RLS**: enabled on all ten tables. This domain has the most
  ownership-scoped policies (driver sees only their own day, customer sees
  only their own address) — flagged in §5 as the highest-complexity RLS
  work in 011.

### 006_finance.sql
- **Enums**: `invoice_status`
  (`draft`,`issued`,`partially_paid`,`paid`,`overdue`,`void`),
  `payment_method` (`mpesa`,`cheque`,`cash`,`bank_transfer`),
  `payment_status` (`pending`,`confirmed`,`failed`,`reversed`),
  `ledger_entry_type` (`debit`,`credit`), `financial_transaction_type`
  (`invoice_issued`,`payment_received`,`refund_issued`,`adjustment`,
  `write_off`).
- **Tables**: `invoices` → `invoice_items` → `payments` →
  `payment_allocations` → `receipts` → `financial_transactions` →
  `ledger_entries`.
- **Triggers**:
  - Invoice-status derivation — `AFTER INSERT` on `payment_allocations`,
    recomputes the parent invoice's `status`
    (`draft`→n/a, `issued`→`partially_paid`→`paid`) from the sum of its
    allocations. Application code never sets this status directly once
    `issued`.
  - Immutability guards — `BEFORE UPDATE` on `invoice_items` (reject any
    change once the parent invoice is not `draft`), on `ledger_entries`
    and `financial_transactions` (reject **all** updates — insert-only,
    full stop), and on `receipts` (reject all updates).
  - Ledger balance check — a **deferrable constraint trigger**
    (`CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`) on
    `ledger_entries`, checked at transaction commit, enforcing that for
    every `financial_transaction_id` touched in the transaction, `sum(debit
    amounts) = sum(credit amounts)`. Deferred rather than immediate because
    the debit and credit rows for one transaction are necessarily two
    separate `INSERT`s. Flagged in §7.7 as the most Postgres-advanced piece
    of this whole schema — needs careful testing.
  - `set_updated_at()` on `invoices`, `payments`. (`invoice_items`,
    `payment_allocations`, `receipts`, `financial_transactions`,
    `ledger_entries` are append-only/immutable — no `updated_at`.)
- **View/RPC**: `customer_statement` (Decision 9) — created at the end of
  this file, since every table it reads (`invoices`, `payment_allocations`,
  `payments`, `receipts`) now exists. Scoped internally by
  `auth.customer_id()` (from 002) so it only ever returns the caller's own
  data; exposes invoices, payments, allocations, receipts, and a computed
  outstanding balance — **not** raw `ledger_entries` or
  `financial_transactions` rows, per Decision 9.
- **Audit**: on `invoices`, `payments`, `payment_allocations`, `receipts`,
  `financial_transactions`, `ledger_entries`. Yes, even though the last two
  are already immutable/append-only — cheap, and consistent defense in
  depth for the domain rule 2 explicitly asks be "auditable... where
  required." **Not** on `invoice_items` beyond what the parent invoice's
  own audit trail plus the immutability trigger already gives.
- **RLS**: `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on every table in
  this file, per `BUSINESS_SCHEMA.md` §D ("strictest domain").

### 007_payments.sql
- **Enums**: `mpesa_intent_status`
  (`initiated`,`pending`,`completed`,`failed`,`expired`), `cheque_status`
  (`pending_clearance`,`cleared`,`bounced`), `reconciliation_batch_status`
  (`open`,`completed`,`completed_with_exceptions`),
  `reconciliation_match_status` (`matched`,`unmatched`,`disputed`),
  `refund_payout_status` (`pending`,`completed`,`failed`) — new, for
  `refund_payouts` (Decision 8; not in `BUSINESS_SCHEMA.md`, sketched
  below).
- **Tables**: `mpesa_payment_intents` → `mpesa_transactions` →
  `mpesa_callback_records` → `cheque_payments` → `reconciliation_batches`
  → `reconciliation_items` → `refund_payouts`.
- **`refund_payouts` (new table, not previously specced)** — sketched here
  for review before it's written as SQL:
  `id`, `financial_transaction_id` (FK → `financial_transactions`, must be
  `transaction_type = 'refund_issued'`), `customer_id` (FK → `customers`),
  `payout_method` (enum: `mpesa_b2c`,`bank_transfer`,`cheque`),
  `amount_cents`, `currency`, `status` (`refund_payout_status`),
  `external_reference` (text — B2C transaction ID / bank ref),
  `initiated_by` (FK → `profiles`, on delete set null),
  `completed_at`, `created_at`/`updated_at`. Realizes the flow from
  Decision 8: `payment → refund transaction (financial_transactions) →
  refund payout (this table) → ledger adjustment (ledger_entries)`.
- **Idempotency mechanisms** (rule 3): `unique` on
  `mpesa_payment_intents.idempotency_key` (client-generated, guards
  against a retried STK-push call) and on
  `mpesa_transactions.mpesa_receipt_number` (Safaricom's own ID — the
  callback handler inserts with `ON CONFLICT (mpesa_receipt_number) DO
  NOTHING`, making a duplicate callback a safe no-op rather than a second
  row).
- **Triggers**: `set_updated_at()` + audit on `mpesa_payment_intents`,
  `cheque_payments`, `reconciliation_batches`, `reconciliation_items`,
  `refund_payouts`. Audit (insert-only, no `updated_at`) on
  `mpesa_transactions`. **Not** on `mpesa_callback_records` — already an
  immutable raw-payload log; auditing an audit-adjacent table is noise.
- **RLS**: `ENABLE` + `FORCE` on every table — same financial-sensitivity
  rule as 006.

### 008_documents.sql
- **Enums**: `customer_document_type`
  (`contract`,`id_copy`,`kra_pin`,`other`), `staff_document_type`
  (`id_copy`,`drivers_license`,`certification`,`other`).
- **Tables**: `customer_documents`, `staff_documents`. (`documents` itself
  already exists from 001 — see §0.1.)
- **Triggers**: audit on both (no `updated_at` — these are link rows,
  created once).
- **RLS**: enabled on both; policies in 011. `documents` itself already
  had RLS enabled back in 001 — its policies are still written in 011,
  alongside everything else, just noting the `ENABLE` happened earlier.

### 009_communication.sql
- **Enums**: `notification_channel` (`sms`,`email`,`push`),
  `notification_status` (`queued`,`sent`,`failed`),
  `notification_delivery_status` (`sent`,`delivered`,`failed`,`bounced`).
- **Tables**: `notifications` → `notification_deliveries`.
- **Triggers**: `set_updated_at()` + audit on `notifications`. **Not** on
  `notification_deliveries` (itself the delivery audit trail).
- **RLS**: enabled on both; policies in 011.

### 010_system.sql
- **No new enum** — `operational_events.event_type` stays `text`, not an
  enum, deliberately: this table exists precisely so a new kind of
  operational event doesn't require a migration. (Contrast with
  `collection_status`/`invoice_status`/etc., which *should* be closed
  enums because their transition graphs are load-bearing business rules —
  `operational_events` is a reporting stream, not a state machine.)
- **Tables**: `operational_events` only. `audit_log` already exists.
- **Triggers**: none — this table has no `updated_at` and is not itself
  audited (it's a log).
- **RLS**: enabled; policy in 011 is `super_admin`/`admin` read-only, no
  `insert`/`update` policy for any role at all (service-role writes only,
  bypassing RLS by design).

### 011_rls_policies.sql
Depends on literally every prior migration — every `CREATE POLICY`
references a table created in 001–010, and most reference `auth.user_role()`
(001) and/or `auth.customer_id()` (002) in their `USING`/`WITH CHECK`
clauses. Contents are organized by the domain matrix already written in
`BUSINESS_SCHEMA.md` §D and "Role access summary" — this file turns that
prose table into `CREATE POLICY` statements, table by table. No new tables,
enums, or triggers originate here. See §5 for what's structurally risky
about this file specifically.

---

## 3. Collection status model (Decision 7 — supersedes BUSINESS_SCHEMA.md §B)

```
scheduled → assigned → in_progress → completed
scheduled → assigned → failed → rescheduled
assigned  → in_progress → failed → rescheduled
scheduled → cancelled
assigned  → cancelled
```
`cancelled` and `rescheduled` are both terminal for a given `collections`
row (a rescheduled collection's retry is a *new* row, per
`failed_collections.rescheduled_collection_id`, unchanged from
`BUSINESS_SCHEMA.md`). `cancelled` has no retry-row concept — a cancelled
collection just doesn't happen; if the customer wants it back on the
schedule, that's a new request or the next recurring cycle, not a linked
row.

`collection_status_events.reason_code` gets these values reserved for
`to_status = 'cancelled'`: `customer_cancelled`, `operational_cancelled`,
`weather`, `vehicle_issue`, `other`. Existing `failed`-path reason codes
(`gate_locked`, `customer_absent`, `bin_not_out`, etc.) are unchanged and
remain distinct from the cancellation codes — this is exactly the
reporting split Decision 7 asked for (cancellations must never be counted
in a "failure" bucket).

---

## 4. Enum creation order (consolidated)

| # | Enum | First created in |
|---|---|---|
| 1 | `profile_kind` | 001 |
| 2 | `profile_status` | 001 |
| 3 | `customer_type` | 002 |
| 4 | `customer_status` | 002 |
| 5 | `property_type` | 002 |
| 6 | `property_status` | 002 |
| 7 | `service_address_status` | 002 |
| 8 | `waste_type` | 003 |
| 9 | `plan_frequency` | 003 |
| 10 | `contract_billing_terms` | 003 |
| 11 | `contract_status` | 003 |
| 12 | `subscription_status` | 003 |
| 13 | `subscription_change_type` | 003 |
| 14 | `vehicle_status` | 004 |
| 15 | `driver_status` | 004 |
| 16 | `collection_status` | 005 |
| 17 | `collection_status_reason` | 005 (new — §7.13) |
| 18 | `request_status` | 005 |
| 19 | `daily_assignment_status` | 005 |
| 20 | `invoice_status` | 006 |
| 21 | `payment_method` | 006 |
| 22 | `payment_status` | 006 |
| 23 | `ledger_entry_type` | 006 |
| 24 | `financial_transaction_type` | 006 |
| 25 | `mpesa_intent_status` | 007 |
| 26 | `cheque_status` | 007 |
| 27 | `reconciliation_batch_status` | 007 |
| 28 | `reconciliation_match_status` | 007 |
| 29 | `refund_payout_status` | 007 (new) |
| 30 | `customer_document_type` | 008 |
| 31 | `staff_document_type` | 008 |
| 32 | `notification_channel` | 009 |
| 33 | `notification_status` | 009 |
| 34 | `notification_delivery_status` | 009 |

No enum is referenced before its creating migration — verified above by
walking every table's status/type column against this list.

---

## 5. Trigger and function dependency summary

| Function/trigger | Created in | Depends on | Used by |
|---|---|---|---|
| `set_updated_at()` | foundation migration (exists) | — | every mutable table, 001–009 |
| `log_audit_event()` | foundation migration (exists) | `audit_log` | every audited table, 001–009 |
| `auth.user_role()` | 001 | `profiles`, `roles` | RLS policies in 011; app code |
| `auth.customer_id()` | 002 | `customer_profiles` | RLS policies in 011; `customer_statement` (006) |
| `sync_service_address_customer()` | 002 | `properties` | `service_addresses` insert/update |
| `validate_collection_status_transition()` | 005 | `collection_status` enum | `collections` update |
| `transition_collection_status()` (proc) | 005 | `collections`, `collection_status_events` | application code (recommended entry point — see §7.4) |
| invoice-status derivation trigger | 006 | `payment_allocations`, `invoices` | `payment_allocations` insert |
| immutability guard triggers | 006 | — | `invoice_items`, `ledger_entries`, `financial_transactions`, `receipts` update |
| ledger balance constraint trigger | 006 | `ledger_entries`, `financial_transactions` | `ledger_entries` insert, deferred to commit |
| `customer_statement` view/RPC | 006 | `invoices`, `payment_allocations`, `payments`, `receipts`, `auth.customer_id()` | customer-facing statement queries |

Everything in 011 depends on `auth.user_role()` (001) and, for
customer-scoped policies, `auth.customer_id()` (002) — both must exist and
be correct before 011 is written or tested.

---

## 6. RLS dependency and risk notes

- **Authority source**: every policy reads role via `auth.user_role()`, not
  a JWT claim (Decision 3). Both helper functions must be `security
  definer` with an explicitly pinned `search_path` (see §7.8 — this is not
  optional).
- **Simple ownership policies** (a user reading their own `profiles` row, a
  customer reading their own `customers`/`invoices`/`documents` rows via
  `auth.customer_id()`) are straightforward single-column comparisons —
  low risk.
- **Complex ownership policies** are concentrated in 005 (OPERATIONS): a
  driver's access to `collections`/`daily_assignments` depends on a join
  through `driver_assignments` to find "is this caller the driver on this
  assignment, today." These are multi-table `EXISTS` subqueries inside
  `USING` clauses, not simple column comparisons — flagged in §7.9 for
  index support and later query-plan review once there's real data volume.
- **Finance/Payments domains** (006, 007) use `FORCE ROW LEVEL SECURITY` —
  confirmed applied at table-creation time in those files, not deferred to
  011.
- **`audit_log` / `operational_events`** get no `insert`/`update` policy
  for *any* role — writes only happen via triggers and the service-role
  client, which bypasses RLS entirely (by Postgres/Supabase design, not a
  policy gap).

---

## 7. Implementation risks

1. **`documents` lives in 001_identity.sql**, not 008 (§0.1) — a
   deliberate deviation from domain grouping, needed to avoid three
   forward-reference FKs. Flagging for visibility, not asking for a
   different decision — the alternative (deferred `ALTER TABLE ADD
   CONSTRAINT` in 008 for all three referencing columns) is strictly more
   moving parts for no real benefit.
2. **`customer_profiles` lives in 002_customers.sql**, not 001 (§0.2) —
   same category of deviation, smaller scope.
3. **Circular FK between `collections` and `waste_collection_requests`**
   within 005: resolved by creating `waste_collection_requests` first
   without its `resulting_collection_id` constraint, then adding that FK
   via `ALTER TABLE` after `collections` exists, later in the same file.
   Needs a code comment in the migration explaining why, so it isn't
   "fixed" by a future edit that doesn't understand the ordering.
4. **Collection status-transition enforcement is split across a trigger
   and application discipline.** The `BEFORE UPDATE` trigger guarantees no
   *illegal* transition ever lands (e.g. `completed → scheduled` is
   physically impossible). It does **not** guarantee that a
   `collection_status_events` row with the right `reason_code` gets
   written every time — that currently relies on the application always
   calling both operations together. **Recommendation**: build
   `transition_collection_status(collection_id, new_status, reason_code)`
   as a stored procedure that does the `UPDATE` and the
   `collection_status_events` insert atomically, and have all application
   code call it instead of raw `UPDATE collections SET status = ...`. This
   is called out as recommended in §2/§5 but needs your confirmation
   before it's built that way.
5. **The same status-integrity question applies to `invoices`,
   `subscriptions`, `contracts`, and `mpesa_payment_intents`** — Decision 7
   only asked for `collections` to get a hard transition-enforcement
   trigger, but §B of `BUSINESS_SCHEMA.md` defines transition graphs for
   all four of those too. Recommend the same `BEFORE UPDATE` legality-check
   trigger pattern for all four, for consistency and because rule 2
   ("auditable and immutable where required") applies just as much to an
   invoice's status as to a collection's. Not yet approved — flagging
   before it's built into 003/006/007.
6. **`financial_transactions.reference_id` is a polymorphic pointer**
   (`reference_table text + reference_id uuid`, no real foreign key,
   because it can point at `invoices` or `payments` or `refund_payouts`
   interchangeably). This means Postgres cannot enforce that a
   `financial_transactions` row actually points at a real row — a bug
   elsewhere could insert a dangling reference and nothing would catch it
   at the database level. Alternative: replace the polymorphic pair with
   several nullable, properly-FK'd columns (`invoice_id`, `payment_id`,
   `refund_payout_id`, ...) with a check constraint that exactly one is
   set. More columns, but real referential integrity. **This needs a
   decision before 006 is written** — it's a real integrity trade-off, not
   a stylistic one.
7. **The ledger balance invariant needs a deferred constraint trigger**
   (`CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`) — a less
   commonly used Postgres feature. It's the correct tool here (debit and
   credit rows for one transaction are two separate `INSERT`s that must
   both land before the check runs), but it needs explicit test coverage
   once written: an unbalanced multi-row insert inside one transaction
   should fail at `COMMIT`, not silently succeed.
8. **`auth.user_role()`/`auth.customer_id()` must pin `search_path`
   explicitly** (`SET search_path = public, pg_temp` or similar) in their
   `security definer` declaration. This is the standard, well-known
   `security definer` search-path hijack risk in Postgres — not optional
   hardening, a hard requirement for any `security definer` function these
   RLS policies rely on.
9. **RLS subqueries in OPERATIONS need index support.** The driver/customer
   ownership checks in 005's policies (§6) are joins, not flat column
   comparisons. The indexes already specified in `BUSINESS_SCHEMA.md`
   (`driver_assignments.driver_id`, `.daily_assignment_id`, etc.) should
   cover the common case, but this needs an actual `EXPLAIN` review once
   there's realistic data volume — flagged as a follow-up, not a blocker
   for writing the migrations.
10. **Enums are kept one-per-table even where values overlap** (e.g.
    `property_status` and `service_address_status` are both just
    `active`/`inactive`) rather than sharing one `active_inactive` enum
    type. Slightly more enum types; in exchange, each table's status
    values can diverge later (e.g. `properties` gaining an `archived`
    state) without touching an unrelated table's type. Judgment call, not
    a hard requirement — mentioning it so it isn't mistaken for an
    oversight.
11. **`service_plan_prices`'s "one current price" partial unique index**
    protects against two `effective_to IS NULL` rows existing
    simultaneously, but doesn't by itself make "close the old price, open
    the new one" atomic — that's two statements. They need to run inside
    one transaction at the application layer (or a small stored procedure,
    mirroring the `transition_collection_status` recommendation in §7.4)
    to avoid a race where a read lands between the two statements and sees
    zero current prices.
12. **`driver_assignments` needs a partial unique index**
    (`(daily_assignment_id) WHERE ended_at IS NULL`) preventing two
    simultaneously "active" driver legs on one assignment. Not present in
    `BUSINESS_SCHEMA.md` — found while sequencing 005 and added here as a
    gap to close when the SQL is written.
13. **`collection_status_events.reason_code` is upgraded from free `text`
    (as specced in `BUSINESS_SCHEMA.md`) to a proper enum
    (`collection_status_reason`)**, since Decision 7 gave an explicit,
    closed list of cancellation codes. Recommend the same enum also cover
    the existing failure-path codes (`gate_locked`, `customer_absent`,
    `bin_not_out`, plus `other`) for the same data-quality reason, rather
    than leaving failure reasons as free text while cancellation reasons
    are an enum — an inconsistency within one column otherwise. Flagging
    since it changes a previously-specced column's type.
14. **`driver_assignments` is physically created in 005_operations.sql**
    despite being listed under FLEET in the original table list (§0.4) —
    functionally identical, just noting the file placement so it isn't
    "corrected" back into 004 later and broken by the missing
    `daily_assignments` dependency.

---

## 8. What this migration set deliberately does not include

- No seed/demo/business data anywhere, per rule 2 — the only `INSERT` in
  the whole set is the six reference rows in `roles` (§2, 001).
- No changes to application code (`src/types/roles.ts`, `AREA_ACCESS`,
  `src/middleware.ts`, RBAC helpers) yet. Decision 1 approved adopting the
  6-role model in code, but that's an application-layer change tracked
  separately from these migrations — it should land alongside or
  immediately after 001_identity.sql is applied (the code currently reads
  role from the JWT; Decision 3 means it needs to start reading from
  `profiles` via `auth.user_role()`/a server-side lookup instead). Not
  done as part of this migration-planning task.
- No PostGIS (Decision 6 — plain lat/lng only, confirmed upgradeable
  later since nothing here assumes a specific geo column type beyond
  `double precision`).

---

**Awaiting your review of this plan before writing any of the eleven `.sql`
files.** Items most worth a direct answer before I proceed: §7.4/§7.5 (the
stored-procedure pattern for status transitions — collections-only, or all
four state machines?), §7.6 (polymorphic `financial_transactions.reference_id`
vs. typed nullable FK columns), and §7.13 (promoting `reason_code` to an
enum). Everything else in §7 I'll implement as described unless you say
otherwise.
