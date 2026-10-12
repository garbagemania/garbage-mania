# Roles & Area Access

Roles are the shared vocabulary the rest of the system builds on
(`src/types/roles.ts`), kept in sync with the database's canonical role
list (`public.roles`, seeded in `supabase/migrations/001_identity.sql`)
and its RLS policies (`supabase/migrations/011_rls_policies.sql`).
Fine-grained in-app permissions (who can void an invoice, who can
reassign a route) are a future feature-level concern layered inside
`/admin`, not a routing concept — see "What's still ahead" below.

## Roles

| Role | Who |
|---|---|
| `super_admin` | Full system access across every area, including break-glass access to `/driver` and `/portal`. |
| `admin` | Back-office administrator. |
| `finance` | Billing, payments, ledger, statements. |
| `operations_manager` | Routes, vehicles, scheduling, collections. |
| `driver` | Field/collection staff, mobile-first interface. |
| `customer` | Individual or corporate customer — see `customers.customer_type` in the database; individual vs. corporate is never a separate role. |

These are exactly the six roles in `public.roles` — nothing more, nothing
less. The earlier nine-role model (`staff`, `support`, `operations`,
`customer_individual`, `customer_corporate`) has been fully retired; it
does not appear anywhere in the codebase or the database.

## Area access matrix

| Area (URL prefix) | Allowed roles |
|---|---|
| `/admin` | `super_admin`, `admin`, `finance`, `operations_manager` |
| `/driver` | `driver`, `super_admin` |
| `/portal` | `customer`, `super_admin` |

`finance` and `operations_manager` both enter through `/admin` — there is
no separate `/finance` or `/operations` URL area. What they can see and do
*inside* `/admin` is a feature-level permission concern (and, more
fundamentally, an RLS concern — see `BUSINESS_SCHEMA.md` §D and "Role
access summary" for the full per-domain matrix of what each role can
view/create/update at the database level), not a routing one.

## How this is enforced

Three layers, each real, each independently sufficient to stop an
unauthorized read or write — not decorative redundancy:

1. **Route guard** (`src/middleware.ts`) — resolves the signed-in user's
   role from the database (`profiles.role_id → roles.code`, via
   `updateSession()` in `src/lib/supabase/middleware.ts`) and checks it
   against the matrix above via `roleCanAccess()`
   (`src/types/roles.ts`), redirecting to `/login` (no session) or
   `/not-authorized` (wrong role) before a protected page even renders.
2. **Server-side re-check** (`src/app/admin/layout.tsx`,
   `src/app/driver/layout.tsx`, `src/app/portal/layout.tsx`, all via
   `requireAuthenticatedUser()`/`requireRole()` in
   `src/lib/auth/session.ts`/`src/lib/auth/rbac.ts`) — defense in depth
   for whatever reaches rendering without going through middleware.
   `src/lib/auth/rbac.ts` also exposes `requireStaffRole()`,
   `requireCustomer()`, and `requireDriver()` for feature code (Server
   Actions, Route Handlers) that needs a narrower check than "can enter
   this area" — e.g. a driver-only mutation calling `requireDriver()`
   rather than just checking the area.
3. **Postgres RLS** (`supabase/migrations/011_rls_policies.sql`) — the
   actual, final authorization boundary for every table. Layers 1 and 2
   only decide which *pages* render; RLS decides which *rows* any query,
   from any code path, can ever return or modify. A bug in the first two
   layers cannot turn into a data leak or an unauthorized write, because
   RLS doesn't know or care that those layers exist.

**Role is never read from the Supabase Auth JWT's `app_metadata.role`.**
That was true of an earlier version of this app before the production
schema existed; it is not true now. The JWT claim, if it's ever set at
all, is a UI/session convenience at most — `profiles.role_id`, read fresh
from the database on every request that needs it, is the only
authoritative source. This is an approved architecture decision, not an
implementation detail to "simplify" later.

## What's still ahead

- Finer-grained in-app permissions within `/admin` (e.g. only `finance`
  can void an invoice or approve a cheque; only `operations_manager` can
  reassign a route) once those business features are built. The
  `permissions`/`role_permissions` tables exist in the database for this
  (see `BUSINESS_SCHEMA.md` §1 IDENTITY) but are currently unseeded and
  unused by application code — RLS already enforces the coarser,
  table-level version of these same rules in the meantime.
- Staff accounts are now managed in the admin console at `/admin/staff`
  (super admin only) — see `docs/STAFF_MANAGEMENT.md`. The *first* admin
  account is still created via `scripts/bootstrap-admin.ts` — see
  `docs/ADMIN_BOOTSTRAP.md`.

## Who can delete

Deleting records is an **admin-only** power (`super_admin`, `admin`;
`FINANCE_DELETERS` in `src/types/roles.ts`). `finance` can record, verify,
allocate, issue and *cancel* (a reversal that stays on the audit trail) but
cannot delete. Today the only hard delete finance ever had was discarding a
draft invoice; that now requires `require_finance_deleter()`
(`022_admin_delete_and_staff_management.sql`). Ledger entries, payments,
receipts and issued invoices cannot be deleted by anyone (`reject_delete`
triggers, migration 021) — they are reversed instead.


## Finance role is finance-screens only

The `finance` role (the accountant) enters through `/admin` but is confined to the finance screens by `FINANCE_ALLOWED_PREFIXES` (`src/types/roles.ts`), enforced in `src/middleware.ts`. It signs in at `/finance-login`. See `docs/FINANCE_LOGIN.md`.
