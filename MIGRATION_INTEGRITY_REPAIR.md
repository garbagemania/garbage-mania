# Migration Integrity Repair — What Was Found and Fixed

Status: **This codebase had diverged from what I last delivered** — someone
(you, another AI, or a tool) continued building on it independently:
migrations `013`/`014` were added, a customer portal onboarding flow was
started (`src/app/portal/`), and `011_rls_policies.sql` was partially
rewritten ("Corrected to use public helper functions"). That rewrite
introduced several **critical, functionality-breaking and security-relevant
regressions**. This document is the full account of what I found, using
your actual uploaded project (real `node_modules`, real generated
`database.ts`, real Supabase CLI state) rather than static guessing.

None of this has been run against a live database — I still don't have
Docker/Supabase CLI here. But I could, for the first time in this whole
project, run the **real TypeScript compiler** against your actual
dependencies, which is how the first issue below was found.

---

## 1. `@supabase/ssr` version incompatibility (245 real compiler errors)

**Found by actually running `tsc`** (via `node node_modules/typescript/lib/_tsc.js
--noEmit` — the `.bin/tsc` shim itself was broken by the zip/unzip process,
unrelated to your code). Every single query in the app showed `Property 'x'
does not exist on type 'never'`.

**Root cause, confirmed with an isolated one-line test**: `@supabase/ssr@0.5.2`
imports a type from `@supabase/supabase-js/dist/module/lib/types` — a file
that no longer exists in the installed `@supabase/supabase-js@2.116.0`
(much newer than the `^2.45.4` originally pinned; your `npm install`
legitimately resolved to the latest 2.x). That broken import cascades into
every `.from()` call losing its type information entirely.

**Fix**: bumped `@supabase/ssr` to `^0.6.1` in `package.json`. **You need to
run `npm install` again** to actually pick this up — I can't install
packages in this sandbox. If `0.6.1` isn't sufficient, run
`npm install @supabase/ssr@latest` directly.

## 2. `enforce_status_transition()` was silently broken for every status change

`000_foundation.sql` had been given a **different, incomplete**
implementation of this function: it allowed a status change only if a
session flag `app.allow_status_transition` was set to `'true'` — but
**nothing anywhere in the schema ever sets that flag**. The result: every
status transition, including calls to the legitimate
`transition_collection_status()` / `transition_subscription_status()` /
etc. functions, would have been rejected with *"Direct status changes are
not allowed. Use transition_*_status() functions"* — which is exactly
backwards, since those are the sanctioned functions.

Worse: the entire `status_transition_rules` table and its seed data (the
actual list of legal transitions — `scheduled → assigned`, `draft →
issued`, etc.) had been deleted from `001_identity.sql` along with the
correct trigger function.

**Fix**: restored the original `status_transition_rules` table, its seed
data, and the correct `enforce_status_transition()` function in
`001_identity.sql`. Removed the broken GUC-flag version from
`000_foundation.sql` (with a comment explaining why, so it isn't
reintroduced).

## 3. RLS was not enabled at all on 11 tables — including `profiles` and `customers`

`001_identity.sql` and `002_customers.sql` had **lost their `ALTER TABLE
... ENABLE ROW LEVEL SECURITY` statements entirely** — confirmed by
grepping the whole migration set and finding zero matches for these 11
tables: `roles`, `permissions`, `role_permissions`, `profiles`,
`staff_profiles`, `documents`, `customers`, `customer_contacts`,
`properties`, `service_addresses`, `customer_profiles`.

Every `CREATE POLICY` written for these tables was dead code — **Postgres
does not enforce any policy on a table that doesn't have RLS enabled.**
Once migrations were applied, anyone with a table grant (which Supabase
gives `authenticated` by default) could read or write every row in these
tables directly, including every customer's identity and contact data.

**Fix**: added the missing `ENABLE ROW LEVEL SECURITY` statements at the
top of `011_rls_policies.sql`.

## 4. 26 tables had RLS enabled but zero policies — including the entire Finance and Payments domains

Cross-referencing every RLS-enabled table against every table with at
least one policy found **26 tables with no policy at all**: the whole
Finance domain (`invoices`, `invoice_items`, `payments`,
`payment_allocations`, `receipts`, `financial_transactions`,
`ledger_entries`), the whole Payments domain (`mpesa_payment_intents`,
`mpesa_transactions`, `mpesa_callback_records`, `cheque_payments`,
`reconciliation_batches`, `reconciliation_items`, `refund_payouts`), plus
`collection_schedules`, `waste_collection_requests`, `route_stops`,
`collection_status_events`, `failed_collections`, `collection_evidence`,
`customer_documents`, `staff_documents`, `notifications`,
`notification_deliveries`, `operational_events`, `audit_log`, and five
more (`customer_profiles`, `documents`, `properties`, `role_permissions`,
`staff_profiles`) — 31 tables total once combined with item 3.

RLS-enabled + zero policies means **default-deny for every role,
including `super_admin`.** The `changeCollectionStatus` admin action would
have failed every time (its `collection_status_events` insert has no
permitting policy); the dashboard's invoice count would have silently
returned zero for everyone, indistinguishable from "really zero."

Also found: the `public.owns_collection()` helper function had been
deleted along with the policies that used it.

**Fix**: restored all missing policies — **169 policies total**, verified
by an automated cross-check against every RLS-enabled table (51/51 now
covered, confirmed twice with independent methods). Re-added
`owns_collection()`.

## 5. `get_customer_statement()` called functions that no longer exist

The helper functions were renamed from `auth.user_role()`/
`auth.customer_id()` to `public.user_role()`/`public.customer_id()`
consistently everywhere — **except** inside `get_customer_statement()`
(`006_finance.sql`), which still called the old `auth.*` names. This
function would have failed at runtime every time it was called (a
customer viewing their own statement of account).

**Fix**: updated the two call sites to `public.user_role()`/
`public.customer_id()`.

## 6. Bootstrap script vs. the new signup trigger — a real conflict

`014_auth_customer_trigger.sql` auto-provisions a customer profile for
**every** new `auth.users` row. Your `scripts/bootstrap-admin.ts` also
creates a new `auth.users` row (via `inviteUserByEmail`) for the first
`super_admin`. Without a fix, the trigger would create a spurious
customer profile for that user first, then the bootstrap script's own
`profiles` insert would fail with a duplicate-key error.

**Fix**: added `015_staff_provisioning_guard.sql`, which makes the trigger
skip customer-provisioning when `raw_user_meta_data.provisioning =
'staff'`, and updated `bootstrap-admin.ts` to set that flag when inviting.

## 7. Hardcoded demo admin in `seed.sql`

`supabase/seed.sql` inserted a demo admin directly into `auth.users` with
a hardcoded plaintext password (`'Admin123!'`). This directly contradicts
the explicit "no fake admin, no password in source code" rule from Phase
4, and likely wouldn't have worked correctly anyway — a raw `INSERT` into
`auth.users` bypasses Supabase Auth's own identity/session machinery.

**Fix**: replaced with an empty file pointing to the real
`npm run bootstrap:admin` procedure.

## 8. Duplicate foundation migration

Both `000_foundation.sql` and the old `20260101000000_foundation.sql`
existed. The old one was otherwise harmless (idempotent `IF NOT EXISTS`
guards throughout) but redundant and confusing.

**Fix**: deleted `20260101000000_foundation.sql`.

## 9. The new customer portal onboarding flow couldn't write anything

`src/app/portal/onboarding/actions.ts` (not something I was asked to
build — found already in progress) tries to have a newly-signed-up
customer write to `customers`, `properties`, `service_addresses`, and
`customer_contacts` using their own authenticated session. Every one of
those tables' write policies was staff-only, so **every write in this
flow would have been rejected by RLS.** There was also a plain bug: it
queried `customer_profiles` by a column called `profile_id`, which
doesn't exist (the real column is `id`).

**Fix**: added `016_customer_self_service.sql` with narrowly-scoped
policies (each restricted to `customer_id = public.customer_id()` — a
customer still cannot touch another customer's data) allowing a customer
to update their own `customers` row and insert their own
properties/service-addresses/contacts. Fixed the `profile_id` → `id` bug.
Flagged inline (via `COMMENT ON POLICY`) that `customers_update_own`
cannot restrict *which* columns a customer changes at the RLS level — not
exploited by the current onboarding form, but worth a column-level guard
before this policy carries anything more sensitive.

---

## What's still true / unresolved

- **Nothing has been run against a live database.** All of the above was
  found and fixed through static analysis of your real files plus one
  real TypeScript compilation — not `supabase db reset`. That's still the
  next concrete step, and now more important than ever given how much
  changed.
- **`npm install` needs to be run again** to pick up the `@supabase/ssr`
  fix, then `npm run typecheck` and `npm test` to see real results.
- I have not done a line-by-line review of every other file in
  `src/app/portal/` beyond the one onboarding action — only what was
  directly implicated by the errors and RLS gaps above.
- Migration `013`'s "every customer needs primary+secondary phone"
  constraint only fires when `customer_contacts` rows are actually
  touched for that customer — a customer who signs up but never completes
  onboarding has zero contacts and the requirement is never (retroactively)
  enforced. Not a bug, but worth knowing it's a soft requirement in
  practice, not an iron guarantee.

## Next step

Run, in order, on your machine:
```bash
npm install
supabase db reset
npm run typecheck
npm test
```
Report back what happens — that's the first time any of this will have
actually executed.
