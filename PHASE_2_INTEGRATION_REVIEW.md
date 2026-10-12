# Phase 2 — Application Integration Review

Status: **Application role/auth model updated and unit-tested. Live
database execution still NOT verified** — same environment limitation as
`MIGRATION_REVIEW.md`, confirmed again below rather than assumed carried
over. Per instruction, stopping before any dashboard/business UI work.

---

## 1. Live database validation result

**Not performed. No fabricated result follows.** Re-checked in this
session, not assumed from before:

```
$ which docker psql supabase
(nothing found)
$ docker --version   → command not found
$ supabase --version → command not found
$ curl -sm3 https://example.com -o /dev/null -w "%{http_code}"
403   (egress is blocked in this sandbox, not just "slow")
```

No Docker, no `psql`, no Supabase CLI, and no network access to install
any of them. This is the same limitation `MIGRATION_REVIEW.md` reported —
re-verified here rather than carried forward on faith, per the instruction
not to fabricate a database result.

### Exact commands to run locally

On a machine with Docker and the Supabase CLI installed:

```bash
cd garbage-mania
supabase start          # boots local Postgres/Auth/Storage/Studio
supabase db reset       # applies 000_foundation.sql through 011_rls_policies.sql, in order
```

`db reset` is the real test: if any migration has an ordering bug, a bad
FK, a malformed function body, or a policy referencing something that
doesn't exist, this command fails with a specific Postgres error at the
specific `.sql` file and line. **A clean, error-free `supabase db reset`
is the actual live-execution validation this project still needs** — the
static analysis in `MIGRATION_REVIEW.md` and this review both stop short
of it.

Then, specifically for the six items the instructions called out
(auth.user_role, auth.customer_id, the four RLS helpers, SECURITY
DEFINER, search_path, auth-schema permission) — connect with `psql` (the
local connection string is printed by `supabase status`, typically
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) and run:

```sql
select n.nspname as schema, p.proname as function, p.prosecdef as security_definer, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'auth'
  and p.proname in ('user_role', 'customer_id', 'is_assigned_driver',
                     'owns_service_address', 'owns_collection',
                     'is_assigned_driver_for_collection');
```

A successful `supabase db reset` having already completed is itself proof
the migration role *could* create these six functions in `auth` (item 6) —
if it couldn't, `001_identity.sql`/`002_customers.sql`/
`011_rls_policies.sql` would have failed outright with a permissions
error, not silently succeeded. This query's output additionally confirms
`prosecdef = true` (item 4) and shows `proconfig` containing
`search_path=public, pg_temp` for all six (item 5) — six rows, six `true`,
six matching `proconfig` values is the passing result to look for.

For RLS/FORCE RLS coverage:

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
```

For status-transition enforcement and the ledger-balance invariant
specifically, run the pgTAP tests already written for exactly this
purpose (see §10 below for what they check):

```bash
supabase test db
```

And finally, the application's own test suite:

```bash
npm install   # if not already done
npm test
```

**Until `supabase db reset` has actually been run and returned clean, treat
this migration set as "statically plausible," not "verified."**

---

## 2. Migration problems found/fixed

**None found in this session** — no live execution happened, so no live
execution could have surfaced a problem to fix. Per the instruction ("do
NOT redesign the database and do NOT create another migration plan unless
an actual implementation problem requires a migration"), nothing in
`supabase/migrations/` was touched in this task. If `supabase db reset`
surfaces a real error when you run it, that's the trigger for a targeted
fix to the specific migration file involved — not a re-plan.

---

## 3. Application role model synchronized (Phase 2)

`src/types/roles.ts` now declares exactly the six database roles:

```ts
export const ROLES = ["super_admin", "admin", "finance", "operations_manager", "driver", "customer"] as const;
```

The old nine-role model (`staff`, `support`, `operations`,
`customer_individual`, `customer_corporate`) is fully removed — not
aliased, not deprecated-but-present, gone. `AREA_ACCESS` matches
`BUSINESS_SCHEMA.md`'s area matrix and `011_rls_policies.sql`'s role
checks exactly:

| Area | Roles |
|---|---|
| `/admin` | `super_admin`, `admin`, `finance`, `operations_manager` |
| `/driver` | `driver`, `super_admin` |
| `/portal` | `customer`, `super_admin` |

Individual-vs-corporate is not represented anywhere in application code as
a role — it only exists as `customers.customer_type` in the database,
matched by `CustomerProfileInfo` in `session.ts` carrying a
`customerId`, never a customer "type."

---

## 4. Files changed

| File | What changed |
|---|---|
| `src/types/roles.ts` | Six-role model, `STAFF_ROLES`, `ROLE_HOME_AREA` added |
| `src/types/database.ts` | Expanded from an empty placeholder to a hand-authored (not generated — clearly labeled as a stopgap) typed subset covering `roles`/`profiles`/`staff_profiles`/`customer_profiles`/`drivers`, the tables session resolution needs |
| `src/lib/auth/session.ts` | `getCurrentUser()` rewritten to resolve role/kind/staffProfile/customerProfile/driver from the database instead of JWT `app_metadata`; added `AuthenticationError`; renamed `requireUser` → `requireAuthenticatedUser` |
| `src/lib/auth/rbac.ts` | Added `AuthorizationError`, `requireRole()`, `requireStaffRole()`, `requireCustomer()`, `requireDriver()`; kept `assertAreaAccess()` |
| `src/lib/supabase/middleware.ts` | `updateSession()` now also queries `profiles → roles` and returns the resolved `role`, instead of middleware reading a JWT field |
| `src/middleware.ts` | Gates on the database-resolved `role` from `updateSession()`; no longer touches `user.app_metadata` at all |
| `src/app/admin/layout.tsx`, `src/app/driver/layout.tsx`, `src/app/portal/layout.tsx` | Added server-side `requireAuthenticatedUser()` + `requireRole()` checks (defense in depth behind middleware), each redirecting to `/login` or `/not-authorized` on failure |
| `src/app/(auth)/login/page.tsx` | Real form wired to the `login` Server Action; shows an error message from `searchParams.error`; carries `redirectTo` through as a hidden field |
| `src/app/(auth)/login/actions.ts` | **New.** Server Action: `supabase.auth.signInWithPassword()`, resolves role via `getCurrentUser()`, redirects to the role's home area (or an allowed `redirectTo`) |
| `scripts/bootstrap-admin.ts` | **New.** First-`super_admin` bootstrap script (Phase 4 — see §8) |
| `package.json` | Added `tsx` devDependency and `bootstrap:admin` script |
| `docs/ADMIN_BOOTSTRAP.md` | **New.** Exact first-admin setup procedure |
| `docs/ROLES_AND_PERMISSIONS.md` | Rewritten for the six-role model and the three-layer enforcement (middleware → server layout checks → RLS) |
| `README.md` | Added a "Signing in" section, added `bootstrap:admin` to the scripts table |
| `tests/example.test.ts` | Fixed a stale `customer_individual` reference to `customer` |
| `tests/rbac.test.ts` | **New.** Role/area matrix, `requireRole`/`requireStaffRole`/`requireCustomer`/`requireDriver`, role-change behavior |
| `tests/session.test.ts` | **New.** `getCurrentUser()` resolution logic against a mocked Supabase client |
| `tests/middleware.test.ts` | **New.** `middleware()` behavior across all six roles × three areas, unauthenticated, unauthorized, role=null |

Nothing in `supabase/migrations/` was touched, per instruction.

---

## 5. Authentication flow

**Unauthenticated request to a protected area** → `src/middleware.ts`
resolves `user`/`role` via `updateSession()` (queries `profiles → roles`
in the database); no `user` → redirect to `/login?redirectTo=<path>`.

**`/login`** → real form, submits to the `login` Server Action
(`src/app/(auth)/login/actions.ts`):
1. `supabase.auth.signInWithPassword({ email, password })` — server-side
   only, the Supabase client used here never runs in the browser.
2. On failure → redirect back to `/login?error=...` with a generic
   "incorrect email or password" message (never reveals which of the two
   was wrong).
3. On success → `getCurrentUser()` resolves the signed-in user's role from
   `profiles → roles` (a real database read, `profiles_select_self` RLS
   policy is what permits it for the caller's own row).
4. No role (no `profiles` row yet) → `/not-authorized`.
5. Otherwise → the role's home area (`ROLE_HOME_AREA`), unless
   `redirectTo` was supplied and the resolved role is actually allowed
   into that path's area, in which case that takes priority.

**Authenticated request to a protected area** → middleware re-resolves
role fresh from the database on every request (no session-long caching of
role), checks `roleCanAccess(role, area)`; passes through if allowed,
`/not-authorized` if not. The area's own `layout.tsx`
(`admin`/`driver`/`portal`) independently re-checks the same thing
server-side as defense in depth.

**Signed out**: not yet wired to a UI control (no dashboard/nav exists per
Phase 7) — `supabase.auth.signOut()` is the mechanism; adding the actual
sign-out button is dashboard-adjacent UI work, deliberately deferred.

---

## 6. First-admin bootstrap procedure (Phase 4)

No existing bootstrap mechanism was present, so `scripts/bootstrap-admin.ts`
was created — full procedure in `docs/ADMIN_BOOTSTRAP.md`, summarized
here:

- **Not part of the Next.js app** — a standalone script, so it's safe for
  it to use the Supabase **service-role key**, which never ships to the
  browser anywhere in this codebase.
- **Refuses to run** if a `super_admin` already exists (checked via a
  database read) — it can only ever create the first one, not a repeatable
  admin-minting tool.
- **No password anywhere** — uses `supabase.auth.admin.inviteUserByEmail()`,
  which emails the new admin a secure, time-limited link to set their own
  password. Nothing is typed into a script argument, env var, or shell
  history.
- Creates the matching `profiles` (`kind: 'staff'`, `role: super_admin`)
  and `staff_profiles` rows using the service-role client (bypasses RLS by
  design — this is the one legitimate reason to use it here, since no
  `super_admin` yet exists to satisfy `profiles_insert_staff`'s normal RLS
  check).

Run via:
```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run bootstrap:admin -- --email you@garbagemania.co.ke --name "Your Name"
```

**Not executed in this sandbox** (no live Supabase project to run it
against) — reviewed for correctness by careful reading, not by running it.

---

## 7. Login flow (Phase 5) — expected routing, as implemented

| Signed-in as | Lands on |
|---|---|
| (unauthenticated) | `/login` |
| `super_admin` | `/admin` |
| `admin` | `/admin` |
| `finance` | `/admin` |
| `operations_manager` | `/admin` |
| `driver` | `/driver` |
| `customer` | `/portal` |
| authenticated, no role/permission | `/not-authorized` (existing page, unchanged) |

No fake dashboard content was added anywhere — `src/app/admin/dashboard/page.tsx`
still reads exactly as it did before this task (a structural placeholder
that explicitly says it has no real figures yet).

---

## 8. Authorization tests added (Phase 6)

- **`tests/rbac.test.ts`** — all six roles × all three areas (allowed and
  disallowed combinations), `assertAreaAccess`/`requireRole`/
  `requireStaffRole`/`requireCustomer`/`requireDriver`, `kind`/`role`
  mismatch (defense in depth for what the `validate_profile_kind` DB
  trigger already prevents), and an explicit "role downgrade removes
  previously-granted access" + "removed role is no-access, not
  default-access" pair of tests.
- **`tests/session.test.ts`** — `getCurrentUser()` against a mocked
  Supabase client: unauthenticated, authenticated-with-no-profile-row,
  staff resolution (with `staffProfile`), driver resolution (with
  `driver`), customer resolution (with `customerProfile`), and a
  same-user-different-role-between-two-calls test proving there's no
  caching that would let a changed role linger.
- **`tests/middleware.test.ts`** — `middleware()` across unauthenticated,
  every allowed role/area pairing, every disallowed role/area pairing
  tried, and role=null-with-a-session. Also asserts the mocked user object
  carries no JWT-shaped `app_metadata` at all and middleware still gates
  correctly — demonstrating there's no fallback path reading it.
- **`tests/example.test.ts`** — one stale reference (`customer_individual`)
  fixed to `customer`.

---

## 9. Tests that passed

**None could be run** — same root cause as `MIGRATION_REVIEW.md`'s Vitest
finding: this sandbox has no `node_modules` (no network access to
`npm install` here). `npm test` was attempted again in this session for
honesty rather than assumed:

```
$ npm test
> vitest run
sh: 1: vitest: not found
```

Every test file above was written carefully and traced through by hand
(mock shapes matched against the real Supabase client call patterns in
`session.ts`/`middleware.ts` line by line), but **"I traced it by hand"
is not "it passed"** — run `npm install && npm test` on your machine,
where dependencies actually installed, to get a real pass/fail result.

---

## 10. Tests that could not run, and why

- **All of `tests/*.test.ts`** (including the pre-existing
  `tests/example.test.ts`) — no `node_modules` in this sandbox, per §9.
- **`supabase/tests/*.sql`** (the three pgTAP files from
  `MIGRATION_REVIEW.md` — `collection_status_transitions.sql`,
  `rls_customer_isolation.sql`, `ledger_balance_invariant.sql`) — same
  root cause as §1: no Docker/Supabase CLI/`psql` here. These are the
  tests that actually exercise live status-transition enforcement and the
  ledger-balance constraint trigger end-to-end; `supabase test db` is
  the command that runs them once you have a local Supabase instance up.
- **Live RLS behavior against a real database** — nothing in this sandbox
  can open a Postgres connection at all, so beyond the pgTAP file, there
  was no way to also manually verify RLS with, say, a second `psql`
  session switching roles. `supabase test db` plus the manual `psql`
  queries in §1 are the concrete substitute.

---

## 11. Unresolved issues

1. **Live execution is still the single biggest open item.** Everything
   in this review and `MIGRATION_REVIEW.md` is static review — careful,
   but not a substitute for `supabase db reset` and `npm test` actually
   succeeding. This is the same item both reviews lead with, deliberately
   not softened on a second pass.
2. **`src/types/database.ts` is a hand-authored stopgap**, not real
   `supabase gen types` output (its own header says so). It only types the
   five tables session resolution touches. Any new code that queries a
   different table will either need that table added by hand (drifting
   further from the real schema) or — better — `npm run db:types` run
   against a real live project to replace the whole file properly. This
   should happen before much more application code gets built on top of
   it.
3. **No sign-out control exists yet** — not a gap in this task's scope
   (no dashboard/nav to put it in, per Phase 7), but worth flagging so it
   isn't forgotten once dashboard work starts.
4. **`getCurrentUser()` makes up to three sequential database round-trips**
   (`profiles`, then `staff_profiles`/`customer_profiles`, then
   optionally `drivers`) on every call. Fine for now — it's called once
   per request in each area layout plus once in the login action — but
   worth revisiting (e.g. a single query with nested embeds, or narrowing
   what a given call site actually needs) if it shows up as a real latency
   cost once there's traffic to measure.
5. **`permissions`/`role_permissions` remain unseeded and unused** — noted
   in `docs/ROLES_AND_PERMISSIONS.md` as future work, not silently
   dropped. Nothing in Phase 2's scope needed them yet (area-level access
   is the six-role model; finer in-app permissions are a feature-level
   concern for when `/admin` actually has features to permission).

---

## 12. Assumptions

1. **The database migrations from `MIGRATION_REVIEW.md` are applied
   as-written** before any of this application code runs against a real
   project — nothing here re-verifies that (see §1/§2).
2. **`auth.uid()` inside `getCurrentUser()`'s RLS-scoped queries resolves
   correctly** via the normal Supabase session cookie flow already set up
   in `src/lib/supabase/server.ts` (unchanged by this task) — this was
   true before Phase 2 and nothing here touches that plumbing.
3. **PostgREST's embedded-resource join syntax** (`roles ( code )` in the
   `.select()` calls in `session.ts`/`middleware.ts`) resolves to the
   `profiles.role_id → roles.id` foreign key automatically, per standard
   Supabase/PostgREST behavior for a single unambiguous FK between two
   tables. Plausible and the common pattern, but — consistent with
   everything else in this review — not verified against a live project.
4. **Supabase local dev email delivery** (Inbucket) is assumed for
   testing the bootstrap script's invite email locally; a real SMTP
   provider is assumed for production use of the same script — both
   documented in `docs/ADMIN_BOOTSTRAP.md`, neither configured by this
   task.

---

## 13. Exact next recommended implementation phase

**Live database validation**, not new feature work:

1. On a machine with Docker + Supabase CLI: `supabase start && supabase db reset`.
   Fix whatever it reports, in the specific migration file it names — do
   not re-plan the schema to do this.
2. `supabase test db` — confirm the three pgTAP files actually pass
   against the now-live database.
3. `npm install && npm test` — confirm every Vitest file in this review
   (and the pre-existing ones) actually passes, not just "was traced by
   hand."
4. Run `npm run bootstrap:admin -- --email ... --name "..."` against that
   same local project, follow the invite link, and confirm signing in at
   `/login` actually lands the new `super_admin` on `/admin` — the one
   end-to-end path this whole review has described but never executed.
5. Only after 1–4 all come back clean: `npm run db:types` to replace the
   hand-authored `src/types/database.ts` stopgap with real generated
   types (§11.2), and only *then* move on to the "real admin control
   center against the real database" phase mentioned in the instructions
   — explicitly not started here.

---

**Stopping here, as instructed.** No dashboard or business UI work was
started.
