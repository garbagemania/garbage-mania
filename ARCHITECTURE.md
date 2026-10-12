# Garbage Mania Services Ltd — Production Architecture

Status: **Foundation phase** (Step 1–2 of the build). No business data, no full schema yet.

## 1. Why this stack

Garbage Mania needs one system serving four very different audiences from one
codebase: an **admin/back-office dashboard** (finance, ops, support, super
admin), a **customer portal** (individual + corporate), a **mobile-first
driver/field app**, and a set of **background jobs** (billing runs, M-Pesa
reconciliation, notification dispatch, GPS ingestion). All four need the same
source of truth for customers, contracts, collections and money — so this is
one application with role-based areas, not four separate apps.

| Concern | Choice | Why |
|---|---|---|
| Web framework | **Next.js 14 (App Router) + TypeScript**, React Server Components | One codebase for admin, portal, and driver UI; server components keep sensitive queries off the client; API routes double as the backend where a dedicated server isn't needed. |
| Database | **PostgreSQL** (via Supabase) | Financial integrity needs real transactions, foreign keys, and constraints — not a document store. Postgres also gives us Row-Level Security (RLS), which maps cleanly onto "a customer sees only their own invoices" / "a driver sees only their own routes." |
| Auth | **Supabase Auth** (email/password + phone OTP, JWT-based) | Native RLS integration (`auth.uid()` inside policies), first-class support for both staff (email) and customers/drivers (phone, common in Kenya). |
| Storage | **Supabase Storage** | Collection proof photos, signed contracts, receipts, statements — same project as the DB and auth, private buckets with RLS-style policies. |
| Realtime | **Supabase Realtime** (Postgres logical replication) | Live driver location, live collection status updates on the ops dashboard, without a separate websocket service. |
| Background jobs | **Supabase Edge Functions (Deno) + `pg_cron`** for scheduled jobs (billing runs, statement generation, M-Pesa reconciliation, notification retries) | Runs next to the data, no separate worker infrastructure to operate initially. |
| Payments | **M-Pesa Daraja API** (STK Push + C2B/B2B callbacks) via a dedicated server-side integration layer; **cheque payments** recorded manually by Finance with an approval step | Isolates payment-provider secrets and webhook handling in server-only code, never in the browser. |
| Styling / design system | **Tailwind CSS + a small typed token layer** (`src/config/theme.ts`) | One place to change color, spacing, and type scale as the brand firms up; works identically across admin, portal, and driver views. |
| UI primitives | Local `components/ui/*` (buttons, cards, inputs, badges, tables) | Keeps a consistent, brand-specific look instead of an off-the-shelf component kit's default aesthetic. |
| Validation | **Zod**, shared between client forms and server actions/API routes | One schema, one source of truth for "what is a valid invoice / contract / collection record." |
| Testing | **Vitest** (+ Testing Library later) | Fast, TypeScript-native, works well with the App Router. |
| Package manager | **npm** (lockfile committed) | No constraint given; npm is the safest default for portability. |
| Hosting target | Vercel (app) + Supabase (data/auth/storage/functions) — not fixed, easy to change | Matches the Next.js/Supabase pairing; can be self-hosted later if required by data-residency needs. |

This is **not** "Supabase as a mock backend." All business rules that must never
be bypassed (who can see which customer's ledger, who can approve a cheque,
who can mark an invoice paid) will live in **Postgres RLS policies and
constraints**, not just in UI checks — the UI is a convenience, the database
is the enforcement point.

## 2. Application areas

```
src/app/
  (auth)/       — login, password reset, OTP (shared by staff + customers);
                  a route GROUP (parens), so it adds no URL segment: /login
  admin/        — super admin, admin, staff/clerk, finance, support, ops
  portal/       — customer-facing (individual + corporate)
  driver/       — mobile-first field/collection interface
  not-authorized/ — shown when a signed-in role hits an area it can't enter
  api/          — webhooks (M-Pesa callbacks), health checks, edge-adjacent routes
```

`admin/`, `portal/`, and `driver/` are real path segments (`/admin/...`,
`/portal/...`, `/driver/...`), not parenthesized route groups — this matters
because `src/middleware.ts` gates access by URL prefix, and a route group
contributes nothing to the URL. `(auth)/` stays a group since `/login` needs
no gating of its own. Each area has its own layout and its own auth guard: a
signed-in session is restricted to the areas its role is allowed into,
enforced in `src/middleware.ts` (`src/types/roles.ts` holds the
role → area matrix) and re-checked in `src/lib/auth/rbac.ts`, and ultimately
in RLS at the database once the schema exists. See
`docs/ROLES_AND_PERMISSIONS.md` for the full access matrix.

## 3. Roles (defined now, enforced fully once the schema lands)

`super_admin`, `admin`, `staff`, `finance`, `support`, `operations`, `driver`,
`customer_individual`, `customer_corporate`. See `docs/ROLES_AND_PERMISSIONS.md`.

## 4. What this phase includes

- Project scaffold that runs locally (`npm install && npm run dev`).
- Environment configuration structure (`.env.example`), never committing real secrets.
- Supabase client setup for browser, server, and middleware contexts.
- Auth foundation: session helpers, route guards, RBAC types (roles exist as
  types/constants; the `profiles`/`roles` tables come in the schema step).
- Design system foundation: color tokens, type scale, spacing, and base UI
  primitives (button, card, input, badge) themed for Garbage Mania.
- Error handling, structured logging, and Zod validation foundations.
- Testing foundation (Vitest) with one passing example test.
- Supabase migration infrastructure (`supabase/migrations/`): one foundation
  migration containing only extensions, a reusable `updated_at` trigger
  function, and a generic `audit_log` table + trigger function — no business
  tables, no seed/sample data. The schema-design step adds business tables on
  top of this, and wires per-table audit and RLS.
- Documentation: this file, brand notes, roles/permissions draft, and a
  "next steps" doc for the schema design phase.

## 5. What this phase deliberately excludes

- The full business schema (customers, contracts, subscriptions, collections,
  routes, vehicles, invoices, payments, ledger, statements, notifications,
  documents, audit logs).
- Any seed/sample/demo business data.
- M-Pesa integration code beyond a documented interface stub — real Daraja
  credentials and callback handling are a dedicated, security-sensitive step.
- The customer ledger and statement-of-account logic (needs the schema first).

## 6. Next steps (separate build phases)

1. **Schema design** — full ERD + migrations for customers, contracts,
   subscriptions, services/products, routes, vehicles, drivers, collections,
   collection proof (photos/GPS), invoices, payments (M-Pesa + cheque),
   customer ledger, statements, notifications, documents, audit logs — with
   RLS policies per role.
2. **Auth + RBAC wiring** against real `profiles`/`roles` tables.
3. **Admin dashboard** CRUD for customers, contracts, routes, vehicles.
4. **Driver app**: route list, collection check-in with GPS + photo proof,
   offline-friendly capture.
5. **Billing engine**: subscription → invoice generation, M-Pesa STK push +
   callback reconciliation, cheque intake/approval, ledger postings.
6. **Customer portal**: account, contracts, invoices, statements, payment history.
7. **Notifications**: SMS/email on invoice, payment, collection events.
8. **Reporting/exports**: PDF invoices/statements, Excel exports, audit log views.
