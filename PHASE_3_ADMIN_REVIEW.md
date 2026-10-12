# Phase 3 — Admin Control Center Review

Status: **Real admin control center built against the real database
schema. Live execution still not verified in this sandbox** — same
environment limitation as `MIGRATION_REVIEW.md` and
`PHASE_2_INTEGRATION_REVIEW.md`, re-confirmed below rather than assumed
carried over.

---

## 1. Files created/changed

**Admin shell & navigation**
- `src/config/admin-nav.ts` — role-scoped nav structure. Items with a real
  route get a working link; everything else renders as an inert "coming
  soon" entry, never a dead link.
- `src/components/admin/admin-shell.tsx` — header, desktop sidebar, mobile
  drawer, sign-out.
- `src/app/admin/layout.tsx` — rewritten to render the real shell instead
  of a placeholder.
- `src/app/admin/error.tsx` — route-segment error boundary for all of
  `/admin`.

**Dashboard**
- `src/app/admin/dashboard/page.tsx` — rewritten with live Supabase count
  queries; no invented numbers.

**Customers**
- `src/lib/validation/customers.ts`, `src/app/admin/customers/actions.ts`
- `src/app/admin/customers/page.tsx` (list, search, filter)
- `src/app/admin/customers/new/page.tsx`
- `src/app/admin/customers/[id]/page.tsx` (detail: info, contacts,
  properties/service addresses, subscriptions, recent collections)
- `src/app/admin/customers/[id]/edit/page.tsx`
- `src/app/admin/customers/loading.tsx`

**Service plans**
- `src/lib/validation/service-plans.ts`, `src/app/admin/service-plans/actions.ts`
- `src/app/admin/service-plans/page.tsx`, `.../new/page.tsx`, `.../[id]/page.tsx`, `.../loading.tsx`

**Subscriptions**
- `src/lib/validation/subscriptions.ts`, `src/app/admin/subscriptions/actions.ts`
- `src/app/admin/subscriptions/page.tsx`, `.../new/page.tsx`, `.../[id]/page.tsx`, `.../loading.tsx`

**Collections**
- `src/app/admin/collections/actions.ts`
- `src/app/admin/collections/page.tsx`, `.../[id]/page.tsx`, `.../loading.tsx`
- `src/components/admin/collections/realtime-refresh.tsx`

**Shared**
- `src/components/ui/skeleton.tsx` — loading-state primitive
- `src/types/database.ts` — substantially expanded (still a disclosed
  hand-authored stopgap — see §12)
- `supabase/migrations/012_admin_phase_support.sql` — **the one migration
  this phase added**, see §6

**Tests** (§9)
- `tests/validation/customers.test.ts`, `service-plans.test.ts`, `subscriptions.test.ts`
- `tests/admin-authorization.test.ts`
- `tests/example.test.ts` — unchanged this phase (already fixed in Phase 2)

---

## 2. Routes created

| Route | Roles | Purpose |
|---|---|---|
| `/admin/dashboard` | super_admin, admin, finance, operations_manager | Live counts |
| `/admin/customers` | all four | List, search, filter |
| `/admin/customers/new` | super_admin, admin (write) | Create |
| `/admin/customers/[id]` | all four (read); write per section | Detail + sub-resources |
| `/admin/customers/[id]/edit` | super_admin, admin | Edit |
| `/admin/service-plans` | super_admin, admin, finance | List |
| `/admin/service-plans/new` | super_admin, admin, finance | Create |
| `/admin/service-plans/[id]` | super_admin, admin, finance | Detail, activate/deactivate, pricing |
| `/admin/subscriptions` | all four (read) | List |
| `/admin/subscriptions/new` | super_admin, admin, finance | Create (+ contract bootstrap) |
| `/admin/subscriptions/[id]` | all four (read); write: super_admin/admin/finance | Detail, status transitions, history |
| `/admin/collections` | all four (read) | List, realtime |
| `/admin/collections/[id]` | all four (read); write: super_admin/operations_manager | Detail, status transitions, history |

Every route above sits under `/admin`, so it already inherits
`src/middleware.ts` (area-level gate) and `src/app/admin/layout.tsx`
(server-side re-check) from Phase 2 — nothing about that layered
enforcement changed this phase. What's new this phase is per-*action*
authorization inside each mutation (§7).

---

## 3. Database tables used

Read and/or written, all through the **authenticated** Supabase client
(`createSupabaseServerClient()`), never the service-role client:
`customers`, `customer_contacts`, `properties`, `service_addresses`,
`service_plans`, `service_plan_prices`, `contracts`, `subscriptions`,
`subscription_history`, `collections`, `collection_status_events`,
`daily_assignments` (read, via embed), `routes` (read, via embed),
`invoices` (dashboard count only, for the three roles RLS allows).

Not touched this phase (by design — Phase 3 explicitly excludes them):
`vehicles`, `drivers`, `route_stops`, `driver_assignments`,
`waste_collection_requests`, `payments`, `payment_allocations`,
`receipts`, `financial_transactions`, `ledger_entries`, all of PAYMENTS,
`documents`/`customer_documents`/`staff_documents`, `notifications`,
`audit_log`, `operational_events`.

---

## 4. Server actions created

| File | Actions |
|---|---|
| `src/lib/auth/actions.ts` (Phase 2, unchanged) | `signOut()` |
| `src/app/admin/customers/actions.ts` | `createCustomer`, `updateCustomer`, `updateCustomerStatus`, `createProperty`, `createServiceAddress`, `createCustomerContact` |
| `src/app/admin/service-plans/actions.ts` | `createServicePlan`, `setServicePlanActive`, `addServicePlanPrice` |
| `src/app/admin/subscriptions/actions.ts` | `createContract`, `createSubscription`, `changeSubscriptionStatus` |
| `src/app/admin/collections/actions.ts` | `changeCollectionStatus` |

No API Route Handlers were added this phase — every mutation is a Next.js
Server Action, consistent with the existing `login`/`signOut` pattern
from Phase 2 rather than introducing a parallel `/api/*` convention.

---

## 5. Authorization rules (per action)

Every action below calls `requireAuthenticatedUser()` then
`requireStaffRole(user, [...])` **before** constructing a Supabase query —
verified by `tests/admin-authorization.test.ts` (§9), which mocks the
Supabase client to throw if it's ever reached, and asserts disallowed
roles never get that far.

| Action | Allowed roles | Matches RLS policy |
|---|---|---|
| `createCustomer`, `updateCustomer`, `updateCustomerStatus` | super_admin, admin | `customers_insert_admin` / `customers_update_admin` |
| `createProperty`, `createServiceAddress` | super_admin, admin, operations_manager | `properties_insert_ops` / `service_addresses_insert_ops` |
| `createCustomerContact` | super_admin, admin | (no `operations_manager` — matches `customer_contacts` having no ops-manager insert policy) |
| `createServicePlan`, `setServicePlanActive`, `addServicePlanPrice` | super_admin, admin, finance | `service_plans_insert` / `service_plan_prices_insert` |
| `createContract`, `createSubscription`, `changeSubscriptionStatus` | super_admin, admin, finance | `contracts_insert` / `subscriptions_insert` / `subscription_history_insert_staff` |
| `changeCollectionStatus` | super_admin, operations_manager | `collections_update_ops` |

Every one of these role lists is a **deliberate mirror** of the matching
RLS policy in `011_rls_policies.sql`, not an independent guess — chosen
by reading each policy's `with check`/`using` clause and matching it
exactly, so the app-layer check and the database-layer check agree.

---

## 6. RLS considerations

- **No RLS policy was loosened, disabled, or bypassed anywhere in this
  phase.** Every admin query and mutation runs through the authenticated
  client, fully subject to `011_rls_policies.sql`.
- **The one new migration this phase** (`012_admin_phase_support.sql`)
  adds **zero** new tables, columns, or policies. It does two things,
  both justified by a real implementation problem hit while building
  this phase, not a redesign:
  1. `alter publication supabase_realtime add table public.collections;`
     — required for the Realtime feature in §8; without it, the
     `RealtimeCollectionsRefresh` subscription would silently receive no
     events (Supabase Realtime is publication-scoped).
  2. `set_service_plan_price()` — an atomic price-rotation function.
     Rotating a plan's price is two writes (close the old row, open the
     new one), and the schema's own `service_plan_prices_one_current_
     per_plan` partial unique index means doing that as two separate
     `supabase-js` calls has a real failure window: if the second call
     failed, a plan could be left with **zero** current prices. This was
     flagged as a known risk in `MIGRATION_PLAN.md §7.11` before any UI
     existed to actually hit it — this is that fix, following the exact
     same `SECURITY INVOKER`, RLS-bound pattern as the existing
     `transition_*_status()` functions (it doesn't elevate privilege; only
     roles already allowed to write `service_plan_prices` can call it).
- **Role-scoped reads confirmed against policy, not assumed**: the
  dashboard (§ earlier, "Outstanding invoices") explicitly omits that
  metric for `operations_manager`, because `invoices_select_staff` never
  grants that role `SELECT` on `invoices` — showing a `0` there would have
  been indistinguishable from "really zero," which is not honest.
- **Status transitions never bypass the database's own enforcement.**
  `changeSubscriptionStatus` and `changeCollectionStatus` both call the
  existing `transition_*_status()` RPCs (003/005), never a raw `UPDATE` on
  the `status` column — so `enforce_status_transition` (001) is still the
  real authority on what's legal, regardless of what the UI's `NEXT_
  STATUSES` maps (mirrored in TypeScript purely to decide which buttons to
  render) say.

---

## 7. Tests written

- **`tests/validation/customers.test.ts`** (15 cases) — `customerFormSchema`,
  `propertyFormSchema`, `serviceAddressFormSchema`, `customerContactFormSchema`:
  valid inputs, missing required fields, malformed email/phone, invalid
  enum values, defaults.
- **`tests/validation/service-plans.test.ts`** (8 cases) — valid plan,
  missing code, negative price, invalid waste type, zero-price edge case;
  price-rotation schema.
- **`tests/validation/subscriptions.test.ts`** (6 cases) — contract and
  subscription schema validity, invalid billing term, non-UUID FK fields,
  invalid frequency.
- **`tests/admin-authorization.test.ts`** (14 cases) — for
  `createCustomer`/`updateCustomer`/`createProperty`/
  `createCustomerContact`/`createServicePlan`/`createSubscription`/
  `changeSubscriptionStatus`/`changeCollectionStatus`: every disallowed
  role rejected with `AuthorizationError` **before** the mocked Supabase
  client is ever called, and a representative allowed role for each
  action shown to get *past* that check (proven by hitting the mock's
  own distinct "should not be reached" error instead).

Combined with Phase 2's existing `tests/rbac.test.ts`,
`tests/session.test.ts`, and `tests/middleware.test.ts` (unchanged this
phase, still covering area-level route protection across all six roles),
this phase's tests specifically add the *action*-level layer requested:
customer CRUD validation, customer creation/update authorization, service
plan validation, subscription authorization, collection authorization.

**Customer isolation**: not re-tested at the unit level this phase — it's
already covered at the RLS level by `supabase/tests/rls_customer_isolation.sql`
(written in the migration-review phase, still unexecuted — see §8). No
new customer-facing (portal) code exists yet for a *customer* to attempt
cross-customer access from the admin side; that becomes directly testable
once the customer portal (a later, explicitly out-of-scope phase) exists.

---

## 8. Tests actually executed

**None.** Same root cause reconfirmed in this session:

```
$ npm test
> vitest run
sh: 1: vitest: not found
```

No `node_modules` in this sandbox, no network access to install them.
Every test file in §7 was written and traced by hand against the real
code paths (mock shapes matched to actual Supabase call signatures,
Zod schemas checked against their own logic line by line), but **traced
by hand is not the same as passed** — this is the same honest distinction
`MIGRATION_REVIEW.md` and `PHASE_2_INTEGRATION_REVIEW.md` already drew,
held to again rather than softened.

**Tests not executed, and why**:
- All of `tests/*.test.ts` (this phase's four new files, plus the three
  from Phase 2) — no `node_modules`.
- `supabase/tests/*.sql` (pgTAP, from `MIGRATION_REVIEW.md`) — no
  Docker/Supabase CLI/`psql` in this sandbox.
- **Nothing in this phase was verified against a live database at all** —
  no customer was actually created and re-fetched after a browser
  refresh; no subscription status transition was actually attempted
  against a real Postgres instance; the `set_service_plan_price()`
  function's atomicity claim is a property of its SQL, not something this
  sandbox could execute to confirm.

---

## 9. Unresolved issues

1. **TypeScript compilation was not verified** (`npm run typecheck`
   requires `node_modules`, unavailable here). This matters more this
   phase than in Phase 2: many queries in this phase use Supabase's
   embedded-resource select syntax (e.g. `service_addresses ( label,
   customers ( display_name ) )`, `service_plans ( name )`,
   `contracts ( contract_number )`). The hand-authored `database.ts`
   (§12) has no `Relationships` metadata — real `supabase gen types`
   output would have it, this stopgap doesn't — so these queries may
   type-check as loose/`any` rather than cleanly, or may not type-check
   at all without additional casts. **This is a real, disclosed risk, not
   a confirmed bug** — `npm run typecheck` is the next concrete step to
   find out which.
2. **The KES-to-cents conversion is a UI-layer responsibility.** Service
   plan pricing forms collect whole/decimal KES (`priceKes`) and convert
   to `price_cents` with `Math.round(priceKes * 100)` in the server
   action — correct, but worth a second look given rule 1's "money must
   use integer cents, never floats" applies to the *stored* value; the
   *entered* value being KES is a UX choice, not a violation, but it's
   the one place in this phase where a float briefly exists (in the
   `<input type="number" step="0.01">` value) before conversion.
3. **The "new subscription" flow's inline contract-bootstrap** auto-sets
   the new contract to `status: 'active'` directly (skipping `draft`) for
   UX simplicity — legal per the transition graph (`draft → active` is
   the seeded rule, but a contract can also be inserted directly with any
   status, since `contracts.status` is only trigger-guarded on `UPDATE`,
   not `INSERT`). Worth a decision on whether a brand-new contract should
   ever start anywhere but `draft` before this ships for real use.
4. **`NEXT_STATUSES` maps in the subscription and collection detail
   pages are hand-maintained TypeScript mirrors** of the database's
   `status_transition_rules` seed data (§6, last bullet) — purely to
   decide which buttons render. If the seeded rules ever change without
   this file being updated to match, the UI would offer a button for a
   transition the database then rejects (safe failure — the RPC call
   fails with a clear error, nothing corrupts), or hide a button for a
   transition that's actually legal. Not wired to read the rules table
   live; flagged as a known drift risk, not fixed this phase.
5. **No standalone `/admin/properties` route** — properties/service
   addresses are managed only from within a customer's detail page, per
   §7 of the original schema design. The nav item exists (§ nav) but is
   marked "coming soon" with a note rather than linked, since there's no
   page for it to link to.

---

## 10. Manual setup required

1. **Everything already listed in `MIGRATION_REVIEW.md` §1 and §7** and
   `PHASE_2_INTEGRATION_REVIEW.md` §1 still applies and is not repeated in
   full here — `supabase db reset`, the `auth`-schema permission check,
   `npm install && npm test`, the bootstrap script.
2. **`supabase db reset` now also needs to apply `012_admin_phase_support.sql`**
   cleanly — specifically confirm `alter publication supabase_realtime
   add table public.collections;` succeeds (this requires the
   `supabase_realtime` publication to already exist, which is standard on
   a normal Supabase project/local dev setup, but worth confirming on
   whatever project this is first deployed to).
3. **Realtime must be enabled for the project** (Supabase Studio →
   Database → Replication, or it's on by default for local dev) for
   `RealtimeCollectionsRefresh` to receive any events at all — the
   migration adds the table to the publication, but the project-level
   Realtime toggle is separate platform configuration, not something a
   migration controls.
4. **At least one service plan and one active customer with a service
   address** need to exist (created through the real UI, not seeded) before
   the "new subscription" flow has anything to select — this is expected,
   not a bug; the empty-state messaging on that page says so.

---

## 11. Final validation — the 17-point checklist, answered honestly

| # | Requirement | Status |
|---|---|---|
| 1 | `/admin` requires authentication | **By design, unverified live.** `src/middleware.ts` (Phase 2) + `src/app/admin/layout.tsx` both call `requireAuthenticatedUser()`/redirect logic unchanged this phase. Not re-tested against a live session this phase. |
| 2 | Unauthorized users cannot access protected admin pages | **By design, unverified live.** Middleware + layout area checks unchanged; this phase's new pages inherit them automatically (no page bypasses the layout). |
| 3 | Role restrictions enforced server-side | **Yes, and newly tested this phase** (§7/§9) — every mutation checks role before any DB call, traced by hand, not executed. |
| 4 | Customer creation writes to the real database | **Code is correct by inspection** (`createCustomer` inserts via the authenticated client and redirects to the new row's real `id`) — **not verified against a live database.** |
| 5 | Customer edits persist | Same as #4 — `updateCustomer` issues a real `UPDATE`; not live-verified. |
| 6 | Refreshing the browser retrieves persisted data | **Structurally true** (every page is a Server Component that queries fresh on every request — there is no client-side cache to go stale), but **not observed to actually happen**, since nothing here ran against a live database. |
| 7 | Service plan records persist | Same caveat as #4 — code path correct by inspection, not executed. |
| 8 | Subscription records persist | Same caveat as #4. |
| 9 | Collection records are read from the real database | **Yes by construction** — `/admin/collections` has no other data source; not executed against live data. |
| 10 | No fake/mock data is being used | **Confirmed by inspection of every file in this phase** — no hardcoded customer/invoice/collection/statistic anywhere; every number and record comes from a Supabase query or is honestly labeled empty. |
| 11 | No service-role key reaches client code | **Confirmed** — every query in this phase uses `createSupabaseServerClient()` (anon key + user session, RLS-bound); the service-role client (`createSupabaseServiceRoleClient`, from the original foundation build) is not imported anywhere in this phase's files. Verified by grep, not just claimed — see below. |
| 12 | Existing RLS remains enabled | **Confirmed** — `012_admin_phase_support.sql` contains no `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` or policy drops; re-ran the Phase-1 static validator (§ below) against all 13 migration files with no issues. |
| 13 | Existing database state-machine enforcement is respected | **Confirmed by design** — every status change goes through the existing `transition_*_status()` RPCs, never a raw `UPDATE ... SET status`. |
| 14 | Existing design system is preserved | **Confirmed** — every page uses the existing `Card`/`Button`/`Badge`/`Input` primitives and `brand-green`/`brand-yellow`/`neutral`/`danger` Tailwind tokens from `src/config/theme.ts`; no new colors, fonts, or component library introduced. |

Grep confirming #11 (no service-role client anywhere in this phase's new code):
```
$ grep -rl "ServiceRoleClient" src/app/admin src/components/admin
(no matches)
```

Static re-validation confirming #12/#6 (RLS/FORCE-RLS unchanged, no ordering issues across all 13 migrations including the new one):
```
$ python3 validate_migrations.py
Files checked: 13
Tables created: 51
Enums created: 35
SECURITY DEFINER functions found: 7
=== NO ISSUES FOUND ===
```

**Run all tests that are executable in the environment**: none are — `node_modules`
is still unavailable, confirmed fresh in §8, not claimed to have passed.

---

## 12. Assumptions carried into this phase

1. Every assumption listed in `PHASE_2_INTEGRATION_REVIEW.md` §12 still
   applies (session/role resolution, PostgREST embed inference, etc.) and
   is not restated in full.
2. **`database.ts` remains a hand-authored stopgap**, now covering ~15
   tables instead of 5 — still missing `Relationships` metadata, still
   explicitly not a substitute for `npm run db:types`. This phase made
   the gap between "stopgap" and "real generated types" materially wider
   (more tables, more embedded joins) — reinforcing, not just repeating,
   §9.1's recommendation to regenerate it for real before much more
   application code is layered on top.
3. **`Math.round()` for KES→cents conversion** assumes standard
   floating-point behavior is adequate for currency entered via a
   `<input type="number" step="0.01">` — true for the amounts a waste
   management business deals in, but noted as a place where float
   arithmetic touches money, even briefly, worth being deliberate about
   rather than silent about (§9.2).

---

## 13. Exact next recommended implementation phase

**Not new features — live verification of everything Phases 1–3 have
built, still entirely unexecuted:**

1. `supabase start && supabase db reset` — now including
   `012_admin_phase_support.sql`. Confirm the realtime publication and
   `set_service_plan_price()` both apply cleanly.
2. `npm install && npm run typecheck` — resolve whatever the Supabase
   embedded-select typing gap (§9.1) actually turns out to be; likely
   candidates are adding targeted type assertions or biting the bullet on
   `npm run db:types` now rather than later.
3. `npm test` — confirm every test file across all three phases actually
   passes, not just "traced by hand."
4. `npm run bootstrap:admin`, sign in, and manually walk the real path:
   create a customer → add a property/service address → create a service
   plan → create a subscription → confirm it shows on the customer page →
   refresh the browser and confirm it's still there. This is the actual
   end-to-end proof items #4–#9 above are currently only claimed, not
   demonstrated.
5. Only after 1–4 come back clean should the next *feature* phase begin —
   per the original instructions, that's explicitly **not** the customer
   portal or driver app yet; those remain out of scope until directed
   otherwise.

---

**Stopping here, as instructed.** No customer portal or driver
application work was started.
