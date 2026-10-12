# Customer portal — what was built, what was found, what is unverified

Scope: customer side, plus (v6) customer sign-up with super-admin approval. Existing migrations, RLS policies,
auth and roles were not edited; approval is added by ONE new migration, `017_customer_signup_approval.sql`
(see "Sign-up with approval" below). Edits outside the portal: `src/types/database.ts` (request status fix +
hand-added types for the new column/table/functions) and one new admin nav item.

## Pages (all under `/portal`, all real data, nav = `src/config/portal-nav.ts`)

| Route | Reads | Writes |
|---|---|---|
| `/portal` | customers, `get_customer_statement()`, service_addresses, subscriptions, service_plans, collections | – |
| `/portal/account` | customers, customer_contacts | customers: name, billing email, billing phone only |
| `/portal/addresses` (+`/new`, `/[id]`) | service_addresses, properties | properties + service_addresses insert; property fields edit |
| `/portal/subscription` | subscriptions, contracts, service_plans, service_plan_prices, service_addresses | – |
| `/portal/collections` | collections, collection_evidence, failed_collections, plans, requests | – |
| `/portal/billing` | `get_customer_statement()`, invoice_items, mpesa_payment_intents | – |
| `/portal/statement` | `get_customer_statement()` | – |
| `/portal/requests` | waste_collection_requests, collections | waste_collection_requests insert |

Every page has a loading state (`portal/loading.tsx`), error state (`portal/error.tsx` + inline `LoadError`) and
empty state. Mutations redirect back with a success/error banner. `customer_id` always comes from the session,
never from a form or URL; queries also carry an explicit `.eq("customer_id", …)` on top of RLS.

Also fixed: the old dashboard's Sign out button posted to `/auth/signout`, which does not exist. It now uses the
shared `signOut` action. Onboarding is now idempotent (no duplicate property/contacts on revisit or retry) and
redirects already-registered customers to `/portal`.

## Design decisions you should know about

- **Statement/balance do not read the ledger directly.** Customers deliberately have no RLS policy on
  `ledger_entries` / `financial_transactions` (BUSINESS_SCHEMA Decision 9), and I did not add one. The portal uses
  `get_customer_statement()`, the sanctioned customer path. Statement debits are invoices; credits are payment
  allocations dated at the payment's received date, so the closing balance equals the sum of invoice balances.
- **No pay button.** M-Pesa exists only as tables (`mpesa_payment_intents`, `mpesa_transactions`, …) plus unused
  env placeholders; there is no STK-push route or callback handler in the app. I did not simulate one. Billing shows
  pending payments/intents as *pending*, never as paid, and says online payment isn't available yet.
- **Requests = collection requests only.** `waste_collection_requests` is the only customer-writable request table.
  New service / missed collection / service issue have no table, so the page tells the customer to contact
  Garbage Mania instead of faking a form.
- **Edit limits follow RLS.** Customers can't update service_addresses or customer_contacts (staff-only), so label,
  access notes (after creation) and contact phone numbers are read-only.
- **No driver name or proof photo.** Customers have no policy on `drivers`/`profiles` of staff or on `documents`
  for collection evidence, so the collections page shows "Proof recorded <time>" from `collection_evidence`
  but cannot show the image or driver.

## Backend findings (proposed fixes in `supabase/proposed/018_customer_portal_hardening.sql`, not applied)

1. `customers_update_own` is row-level only: a customer can change their own `status`, `notes`, `kra_pin` by calling
   Supabase directly. The portal UI only writes safe columns, but the database allows more.
2. `invoices_select_own` has no draft filter, so customers can read draft invoices; the SQL function's balance also
   counts drafts. The portal hides drafts and derives balances without them, but RLS should do this.
3. `waste_collection_requests_insert_own` doesn't verify the address belongs to the customer. The portal checks
   it in the action; the policy should too.
4. `src/types/database.ts` typed `waste_collection_requests.status` as `PENDING|SUCCESS|ERROR`; the real enum
   is `request_status`. Corrected (3 lines). Regenerate with `npm run db:types` when convenient.

## Verification status — read this

Run in this sandbox: nothing needing `node_modules`, a database or the network (npm install is blocked here).
- ✅ `tests/portal-finance.test.ts` logic (6 cases) and `tests/portal-nav.test.ts` checks (6 cases) executed
  through a small shim — all pass. Not yet run under real vitest.
- ✅ TypeScript syntax scan of every new file: no syntax errors.
- ❌ **Not run:** `npm run typecheck`, `npm test` (existing suites), `next build`, any page in a browser, login,
  and **all RLS / data-isolation checks** (needs `supabase start`). Treat the pages as written-but-unrun until you do.

Run locally:
```
npm install && npm run typecheck && npm test && npm run lint
supabase db reset && supabase test db      # existing pgTAP isolation tests
```
Then log in as two different customers and confirm each sees only their own data on every page above, and that
`/portal/addresses/<other customer's service address id>` returns 404.


---

# Sign-up with super-admin approval (v6)

Source of truth: the paper **Client On-Boarding Form (Form A1)**. One form for Corporate and Individual.

## Flow

1. `/login` already linked to `/signup` ("Create Customer Account"). `/signup` is now the full on-boarding form:
   Corporate/Individual, name, email, phone + required second phone, county, ward, region, street/road,
   house/gate/apartment no., address description, the 14 service tick-boxes, service days, billing cycle,
   caretaker (optional), plus password + confirm.
2. Submitting creates the Supabase user. The `handle_new_customer_signup()` trigger creates, in one transaction:
   profile (role `customer`), customer with `approval_status = 'pending'`, customer link, a
   `customer_signup_requests` row (everything on the form), contacts (primary/secondary/caretaker as tertiary) and
   the first property + service address. The user is signed straight back out → `/signup/submitted`.
3. A pending or rejected customer **cannot sign in** (login signs them out with a clear message) and, if they
   somehow hold a session, `/portal` redirects them to `/awaiting-approval`.
4. **`/admin/customer-approvals`** (super_admin only; nav item shown only to super_admin) lists applications
   (Pending / Approved / Rejected / All) with every submitted field and Approve / Reject (+ optional note).
   A rejected application can be approved later.

## Where approval is actually enforced (not just hidden)

- `customer_id()` and `owns_service_address()` return nothing unless the customer is `approved`, so **every
  existing customer RLS policy stops granting access** to a pending/rejected customer (including via a direct
  Supabase API call with their JWT).
- Only `super_admin` can change `approval_status`: `review_customer_signup()` checks the role, and a trigger on
  `customers` rejects any other signed-in user's attempt to change that column - including a customer editing
  their own row.
- The trigger always inserts `pending`; the signup action never sends an approval value.

## Decisions / assumptions to confirm

- **Fee** is not collected from the customer (they shouldn't set their own price). Super admin agrees it when
  creating the subscription. The requested services / days / billing cycle are stored as *requests*, shown on
  the approval card; they do not create subscriptions automatically.
- **Billing cycle** (monthly/quarterly/half-yearly/yearly) is stored on the request only. The contracts table's
  billing terms (prepaid/net_15/net_30) mean something different, so I did not map one to the other.
- **Region** maps to `properties.sub_county` (closest existing column); the original is kept on the request.
- **Second phone** is required on the form because migration 013 requires primary + secondary contacts.
- **Existing customers stay approved** (column default). Customers created by staff in /admin are approved.
  Anything created via the auth API/script without staff provisioning is `pending` until approved.
- Email confirmation: if your Supabase project has "Confirm email" on, the customer must confirm the email AND
  be approved. Turn it off in Supabase → Authentication → Providers → Email if you only want approval.
- `/signup/submitted` and `/awaiting-approval` are public pages outside the middleware matcher by design.

## Verification status (v6)

- ✅ `tests/validation/customer-signup.test.ts` (11 cases) and `tests/customer-approval.test.ts` (7 cases):
  executed through a vitest shim with a real zod 3.23.8 - all pass. Portal nav tests (6) re-run, pass.
  Not yet run under real vitest.
- ✅ TypeScript syntax scan of all new files: no syntax errors.
- ❌ **Not run:** the migration itself (no Postgres here), `supabase/tests/customer_signup_approval.sql`, `npm run
  typecheck`, `next build`, and the pages in a browser. `useFormState` (signup form) relies on Next 14.2's React.
  The trigger is the highest-risk piece: apply it with `supabase db reset` and run `supabase test db` first.

## Also changed in this version

- `supabase/proposed/017_customer_portal_hardening.sql` was renamed `018_...` so it does not clash with the real
  017. Still proposed, not applied.
