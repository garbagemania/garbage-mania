# Go-live checklist

Work through this before real customers use the system. Items marked **(you)** need
your accounts or decisions; the code side is already in place.

## 1. Tests must be green
- [ ] `supabase db reset && supabase test db` passes (all 8 files).
- [ ] `npm run lint && npm run build && npm run test` pass.
- [ ] CI (`.github/workflows/ci.yml`) is green on `main`. Turn on "require status checks" in GitHub branch protection.

## 2. Production email (password reset, approvals) **(you)**
Supabase's built-in mailer is for testing only and is heavily limited.
- [ ] Choose an SMTP provider (Resend, Brevo, SendGrid, Zoho, etc.) and verify your sending domain (SPF/DKIM).
- [ ] Hosted Supabase dashboard > Authentication > SMTP Settings: enter the provider details.
- [ ] Authentication > URL Configuration: set **Site URL** to your live address and add
      `https://YOUR-DOMAIN/auth/callback` to **Redirect URLs** (password reset needs this).
- [ ] Set `NEXT_PUBLIC_APP_URL` to the live address in your hosting environment.
- [ ] Send yourself a real password-reset email and click through it.

## 2b. Company details **(you)**
- [ ] Fill `NEXT_PUBLIC_COMPANY_EMAIL / PHONE / WHATSAPP / ADDRESS / HOURS` (see `.env.example`).
      They appear on `/contact` and on printed statements/invoices. Blank fields are hidden.

## 3. Legal
- [ ] Have a Kenyan lawyer review `/terms` and `/privacy` (src/app/terms, src/app/privacy). They are
      sensible drafts, not legal advice.
- [ ] Check whether Garbage Mania must register as a data controller/processor with the Office of the
      Data Protection Commissioner (ODPC). Most businesses holding customer data do.
- [ ] Sign-up now records `terms_accepted_at` in the account's metadata when someone agrees.

## 4. Account security
- [ ] Hosted Supabase > Authentication > Rate Limits: confirm sign-in / email limits (local values are in `supabase/config.toml`).
- [ ] Enable CAPTCHA (Authentication > Bot and Abuse Protection) on sign-up and sign-in if you see abuse.
- [ ] Two-step login (TOTP): enable MFA (TOTP) in the hosted Supabase dashboard (Authentication > Multi-Factor), then
      each admin/finance user turns it on from Admin > My account. Use strong unique passwords regardless.
- [ ] Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or commit it.

## 5. Data safety **(you)**
- [ ] Turn on daily backups; for a paid plan enable Point-in-Time Recovery (finance records live here).
- [ ] Do one test restore.
- [ ] Add error monitoring (e.g. Sentry) and uptime checks on `/api/health`.

## 6. Still to build (not in this release)
- M-Pesa payments (deferred by choice).
- SMS/email notifications to customers (needs a provider such as Africa's Talking).
- Offline mode for drivers; end-to-end browser tests.

## 7. Before you launch (final pass) **(you)**
- [ ] `npm audit --omit=dev` shows only issues in packages that ship to users; fix those. (Warnings in dev tools are not shipped.)
- [ ] Hosted database: apply migrations with `supabase link` + `supabase db push`; never run `db reset` against production.
- [ ] Create the first super admin with `scripts/bootstrap-admin.ts` (see docs/ADMIN_BOOTSTRAP.md). `scripts/create-local-users.mjs` is for the local database only.
- [ ] Walk through once on a phone: sign in, add a customer, add a route/stop, schedule a run, record a payment, print a statement.
