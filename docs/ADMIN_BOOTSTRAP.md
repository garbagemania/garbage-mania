# Creating the first administrator

`supabase/config.toml` disables self-service sign-up
(`enable_signup = false`), and every RLS policy that would let someone
create a `profiles`/`staff_profiles` row requires the caller to already be
a `super_admin`/`admin` (see `profiles_insert_staff` in
`supabase/migrations/011_rls_policies.sql`). That's correct for every
account after the first, but it means the very first admin cannot be
created through the app itself — there's a deliberate, narrow exception
for exactly that: `scripts/bootstrap-admin.ts`.

## What it does

1. Refuses to run at all if a `super_admin` already exists (checked via a
   database read), so it can only ever mint the *first* one.
2. Looks up the `super_admin` role row.
3. Sends the address you give it a Supabase Auth **invite email** — a
   secure, time-limited link that lets that person set their own password.
   No password is ever typed into the script, an argument, an environment
   variable, or your shell history.
4. Creates the matching `profiles` row (`kind = 'staff'`, role =
   `super_admin`) and `staff_profiles` row.

It runs with the Supabase **service-role key**, which bypasses RLS by
design — that's exactly why it's a standalone script (`scripts/`, not part
of the Next.js app) rather than something reachable from a browser or an
API route. The service-role key never ships to client code anywhere in
this codebase.

## How to run it

From a machine (or CI secret context) that has your Supabase project's
service-role key available — **not** committed to the repo, not in
`.env.local`, just exported for this one command:

```bash
npm install   # if you haven't already

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  npm run bootstrap:admin -- --email you@garbagemania.co.ke --name "Your Name"
```

Optional: `--employee-number GM-0001` (this is the default if omitted).

You should see:

```
Done. Invited you@garbagemania.co.ke as the first super_admin.
They'll receive a Supabase Auth email to set their password and sign in at /login.
```

Check the inbox for that address, follow the link to set a password, then
sign in at `/login` — you'll land on `/admin`.

## Prerequisites

- `supabase/migrations/001_identity.sql` must already be applied (the
  script looks up the `super_admin` role row and will fail with a clear
  message if it isn't there).
- Supabase's email sending must be configured for invites to actually
  arrive — on a fresh local `supabase start`, invite emails land in the
  local Inbucket dev mail server instead of a real inbox; check
  `supabase status` for its URL. On a hosted Supabase project, configure a
  real SMTP provider (Supabase's docs cover this) before running this
  against production, or the invite email will not be delivered.

## If this script fails partway through

It prints exactly what succeeded and what didn't, and what to do next:

- If the invite email sent but the `profiles`/`staff_profiles` insert
  failed, it tells you the `auth.users` id it created so you (or a
  developer with direct database access) can insert those rows manually
  and the person can still use the invite link they received.
- If it refuses to run because a `super_admin` already exists, that's
  working as intended — use the admin console (once built) to invite
  additional staff instead of re-running this script.

## Adding staff after the first admin

Every account after this one is created by a `super_admin`/`admin` through
the normal application (once that admin-console feature exists) — never
through this script again. This script is a one-time bootstrap, not a
general user-creation tool.
