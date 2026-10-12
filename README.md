# Garbage Mania Platform

Production platform for **Garbage Mania Services Ltd** (Langata Heights, off
Langata Road, Nairobi). This is the **foundation build**: project structure,
auth/RBAC scaffold, design system, and database/migration tooling. There is
no business schema and no business data yet — see `ARCHITECTURE.md` for what
this phase includes and what comes next.

## Stack

Next.js 14 (App Router, TypeScript) · Supabase (Postgres, Auth, Storage,
Realtime) · Tailwind CSS · Zod · Vitest. Full rationale in `ARCHITECTURE.md`;
brand/design tokens in `docs/DESIGN.md`; roles in `docs/ROLES_AND_PERMISSIONS.md`.

## Getting started

Requires Node.js ≥ 20 and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from your
# Supabase project (local or hosted). M-Pesa variables can stay blank until
# the payments phase.

# 3. Start Supabase locally (Postgres + Auth + Storage on your machine)
supabase start

# 4. Apply the foundation migration
supabase db push

# 5. Run the app
npm run dev
```

The app runs at `http://localhost:3000`. `/` is a public landing page,
`/login` is the staff and customer sign-in (`/finance-login` is the
accountant's), and `/admin`, `/portal` and `/driver` are the role-gated
areas. Admin covers customers, plans, subscriptions, collections, finance
and staff management; the portal and driver screens are live too. See
"What is and is not built" in `docs/STAFF_MANAGEMENT.md` for the current gaps
(M-Pesa, notifications, PDFs, route setup, hosted deployment).

## Signing in

Self-service sign-up is disabled (`enable_signup = false` in
`supabase/config.toml`) — every account is provisioned by staff. For a
brand-new project with no accounts at all yet, see
`docs/ADMIN_BOOTSTRAP.md` to create the first `super_admin` via
`npm run bootstrap:admin`. After that, the super admin adds, re-roles,
suspends and resets staff at `/admin/staff` (see `docs/STAFF_MANAGEMENT.md`). After signing in at `/login`, you land on
`/admin`, `/driver`, or `/portal` depending on your role — see
`docs/ROLES_AND_PERMISSIONS.md`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (single run) |
| `npm run test:watch` | Vitest (watch mode) |
| `npm run db:migrate` | Push local migrations to the linked Supabase project |
| `npm run db:reset` | Reset the local Supabase database and reapply migrations |
| `npm run db:types` | Regenerate `src/types/database.ts` from the live schema |
| `npm run bootstrap:admin -- --email ... --name "..."` | One-time first-`super_admin` setup — see `docs/ADMIN_BOOTSTRAP.md` |

## Project layout

```
src/app/            Route areas: (auth), admin, portal, driver, api
src/components/ui/   Design-system primitives (Button, Card, Badge, Input)
src/components/layout/ Shared chrome (AppShell)
src/lib/             Supabase clients, auth/session/RBAC, logging, validation, env
src/config/theme.ts  Design tokens (single source of truth for color/type/spacing)
src/types/           Shared types: roles, database (placeholder until schema exists)
supabase/            Supabase CLI config + migrations
tests/               Vitest setup + example tests
docs/                Architecture-adjacent docs: design tokens, roles matrix
```

## What's deliberately not here yet

No customers, contracts, subscriptions, services, routes, vehicles,
collections, invoices, payments, ledgers, notifications, or documents tables
— and no sample/seed/demo data of any kind, per the brief. The production
database starts clean; the next step designs that full schema as one
reviewed piece of work (see `ARCHITECTURE.md`, §6 "Next steps").
