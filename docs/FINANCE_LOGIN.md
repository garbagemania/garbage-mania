# Finance (accountant) login

The accountant signs in at **`/finance-login`** and can only use the finance
screens. Nothing else in the app is reachable for that account.

## Create the accountant's account (once)

From a trusted machine, with the Supabase service-role key exported for this
one command only (never put it in `.env.local`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  npm run create:finance-user -- --email accountant@garbagemania.co.ke \
    --name "Full Name" [--employee-number GM-FIN-001]
```

You'll be asked to type the password at a hidden prompt (min 12 characters).
Give the accountant that email and password. The accountant can change it at **My password** (`/admin/account`) after signing
in; a super admin can reset it at `/admin/staff`. The script
`npx tsx scripts/set-admin-password.ts --email accountant@garbagemania.co.ke`
still works as a fallback.

The accountant **cannot delete** anything: only an admin or super admin can
discard a draft invoice (see `docs/ROLES_AND_PERMISSIONS.md`).

## What the accountant can open

Everything in the sidebar's **Finance** group, and nothing else:
finance dashboard, customer accounts (+ statements), unallocated payments,
finance reports/export, invoices, payments, M-Pesa, receipts, refunds,
reconciliation, customer statements.

## How it is enforced (three layers)

1. **`src/app/(auth)/finance-login/actions.ts`** - after password sign-in, the
   role is read from the database; anything other than an active `finance`
   staff account is signed straight back out.
2. **`src/middleware.ts`** - the `finance` role is bounced to `/admin/finance`
   from every `/admin` path not in `FINANCE_ALLOWED_PREFIXES`
   (`src/types/roles.ts`). Server Actions post to their page URL, so they are
   covered too.
3. **Postgres RLS** (unchanged, `011_rls_policies.sql`) stays the final
   boundary underneath both.

The sidebar also hides every non-finance item for this role, and finance no
longer appears in the plan/subscription management lists.

## Changing what the accountant can see

Edit `FINANCE_ALLOWED_PREFIXES` in `src/types/roles.ts` and the matching
"Finance" group in `src/config/admin-nav.ts`. `tests/admin-nav.test.ts`
fails if the sidebar shows something the allow-list would block.
