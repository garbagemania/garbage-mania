# Audit changes (static review - nothing here has been executed)

Written without Docker/Postgres/Node deps, so `supabase db reset`, `supabase test db`,
`npm run typecheck`, `npm test` and `npm run build` have NOT been run against these changes.

## Root cause of the Customer Approvals error
`customer_signup_requests` is created by `017_customer_signup_approval.sql`; the local DB had not applied it.

## Changes
- `supabase/migrations/018_customer_portal_hardening.sql` - promoted from `supabase/proposed/`.
  Column guard on customer self-updates (status/notes/kra_pin), drafts hidden from customers,
  collection requests must use the customer's own service address.
- `supabase/tests/*`, `020`: see below
- `supabase/migrations/019_driver_collections_storage.sql`
  - `driver_record_collection()` (arrive / complete / fail). Drivers previously had no way to change
    collection status (no UPDATE policy; transition function is SECURITY INVOKER). Completion requires a
    proof photo; failure requires a reason.
  - Drivers can now read only the service addresses/properties of their assigned collections.
  - `documents_select_staff` no longer lets drivers read every document row.
  - Private buckets `collection-evidence` and `cheque-images` + storage policies.
- `src/app/driver/page.tsx`, `actions.ts`, `components/driver/geo-fields.tsx` - real driver portal
  (replaces the placeholder): assigned stops, Arrived, Collected (photo + GPS), Failed/Missed.
- `src/types/database.ts` - added `driver_record_collection` to Functions (hand-edit; regenerate with `npm run db:types` after reset).
- `next.config.mjs` - removed `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` (they hid errors);
  added 12 MB server-action body limit for photos.

## Static findings with no change needed
- Every table and RPC referenced in `src/` exists in the migrations. No "coming soon"/mock/fake markers in `src/`.
- Every admin nav item has a page. Portal layout gates unapproved customers.

## Not done (needs a running stack)
Reset, pgTAP, typecheck, tests, build, per-role login checks, finance and cheque flows, portal onboarding
persistence, route-by-route runtime checks, cheque upload UI (bucket + policies exist, no UI uses them yet).

## pgTAP failures (round 2) - static fixes, NOT re-run
- `collection_status_transitions`: the failure was `collections_check` (a collection must come from exactly one of
  subscription_id / collection_request_id), not the status value. `scheduled` is a valid enum value; the DB enum
  (scheduled/assigned/in_progress/completed/failed/rescheduled/cancelled) is the source of truth and the UI labels map onto it.
  Fixture now creates a waste_collection_request.
- `customer_signup_approval`: missing `tests` schema -> added `supabase/tests/00_test_helpers.sql`
  (`tests.authenticate_as`, test-only, not a migration). Assertion 3: the trigger never created the caretaker contact ->
  new migration `020_signup_caretaker_contact.sql`. The "cannot approve themselves" assertion now checks the UPDATE
  touches 0 rows (RLS hides the row from a pending customer, so no exception is ever raised).
- `ledger_balance_invariant`: fixture referenced a random uuid; now creates a real invoice and uses `invoice_issued`.
  Validation trigger untouched. Plan count unchanged.
- `rls_customer_isolation`: the auth.users fixture fired the signup trigger with no name. Fixture now marks the users
  `provisioning: staff` (as bootstrap-admin does) and creates profiles explicitly. Trigger now raises a clear error when no
  name is available; `profiles.full_name` stays NOT NULL.

## Finance module (round 3) - static, NOT executed
Migration `021_finance_engine.sql` + pgTAP `supabase/tests/finance_engine.sql` (74 assertions).

Existing 006/007 schema extended, not replaced. Key facts found in the audit:
- The ledger had no account dimension and every transaction must net to zero, so a customer "balance" was always 0.
  `ledger_entries.ledger_account` added; balance = sum of the customer's `receivable` entries.
- Finance users could write ledger rows, flip payment status and edit invoice totals via the API (direct INSERT/UPDATE
  policies). Those policies are dropped; all writes go through SECURITY DEFINER functions that re-check the role.
- M-Pesa: no Daraja code exists in the app. DB-side `confirm_mpesa_payment()` (service role only, idempotent on the
  receipt number, amount must match the intent) is in place; the STK push + callback route are NOT built.
- Status labels map onto existing enums (void = Cancelled; pending/confirmed/failed = Pending/Verified/Rejected;
  cheque pending_clearance/cleared/bounced). Overdue is derived (`invoice_balances.is_overdue`).
- VAT is never hardcoded: per line, defaulting to `finance_settings.default_vat_rate_bp` if a super admin sets it.

New UI: /admin/finance (dashboard + period filter), /invoices/new, /invoices/[id], /payments/new, /payments/[id]
(verify/reject, allocate, refunds), /payments/unallocated, /customers, /customers/[id] (tabs, credit notes, debit
adjustments), /customers/[id]/statement, /reports + CSV export route. Existing /admin/invoices and /admin/payments
link into them; payments list is now server-paginated.
Test change: tests/admin-nav.test.ts regex now permits nested /admin/... hrefs (requirement changed). tests/money.test.ts added.

NOT done: PDF export, M-Pesa STK push/callback route, a UI to set finance_settings (use `select set_finance_setting(...)`
as super admin), reversal of a verified payment, bank-statement reconciliation UI, customer-portal changes.
`src/types/database.ts` is not regenerated: finance pages use an untyped client until `npm run db:types`.

## Logo, hardening and go-live prep
- Company logo in every header/page via `<Logo />`; helmet favicon; app-install manifest.
- Forgot/reset password flow (`/forgot-password`, `/reset-password`, `/auth/callback`).
- Public `/terms`, `/privacy`, `/contact`; sign-up requires agreeing to terms (server-enforced).
- Print letterhead + Print/Save PDF on statements and invoices.
- Migration 024: collision-safe `next_employee_number()` (advisory lock).
- CI workflow; Supabase rate-limit/MFA config; `docs/GO_LIVE.md`.

## Review pass (October 2026)
- Fixed: "today" was computed in UTC on 10 admin screens/actions (wrong day 00:00-03:00 EAT); now uses `todayNairobi()`.
- Hardened: sign-in `redirectTo` rejects `//host` and backslash tricks (open-redirect).
- Added: `friendlyError()` so raw Postgres messages never reach customers/staff screens (logged server-side instead).
- Added: loading states for all admin/finance/driver screens, driver error boundary.
- Added: `npm run seed:demo` (local-only) + `docs/DEMO_GUIDE.md`.

## App-readiness (v16)
- Installable app: `public/sw.js` (offline fallback only; never caches signed-in pages or API data), `public/offline.html`,
  `PwaRegister` (production builds only), theme colour + viewport meta.

## v17
- Two-step login (TOTP): setup card on /admin/account, `/mfa` code screen, enforced in the admin layout when enrolled.
  Hosted Supabase: enable MFA (TOTP) under Authentication > Multi-Factor before using it live.
- Migration 025: `cancel_own_collection_request()`; customers get a Cancel button on requests still awaiting review.

## v18 — admin "add / fill in" gaps
- Routes: `+ New route` (/admin/routes/new); route page now adds/removes stops, schedules runs, cancels planned runs, edits the route.
- Drivers: `+ Add driver` (super admin, via Staff > Add staff with role pre-selected); edit licence/expiry/status at /admin/drivers/[id].
- Properties: `+ Add property` (/admin/properties/new) with customer picker.
- Dashboard quick-action buttons (shown per role); customer page links to its finance account instead of the stale "later phase" note.
- Write permissions unchanged: route/driver/vehicle changes = super_admin + operations_manager (matches database RLS).
- Fixed: lint plugin conflict (`root: true` in .eslintrc.json); added scripts/create-local-users.mjs (local accounts).
- Added security headers (nosniff, frame deny, referrer, permissions policy); refreshed docs/GO_LIVE.md.
