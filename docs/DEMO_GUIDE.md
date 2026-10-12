# Demo guide (local)

## One-time setup (copy/paste, in this order)
```bash
supabase start
supabase db reset                      # clean database
# create your admin + finance logins (see chat instructions), then:
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key from `supabase status`>
export ADMIN_EMAIL=<your admin email>
export ADMIN_PASSWORD=<your admin password>
npm run seed:demo                      # loads plans, customers, invoices, payments, requests
npm run dev
```

## Suggested 7-minute walk-through
1. **Sign-up** (`/signup`): show the form, the Terms checkbox, then submit a new customer.
2. **Approval** (admin > Approvals): approve it. Mention that unapproved customers can see nothing.
3. **Customer view**: sign in as a demo customer (e.g. `amina.demo@example.com`, password `Demo@12345`):
   dashboard, billing, statement (use Print / Save PDF for the letterhead), request a collection.
4. **Admin**: dashboard, customers, subscriptions, collection requests (approve one, it becomes a scheduled collection).
5. **Finance** (`/finance-login`): invoices (paid, part-paid, overdue, draft), record a payment, allocate it,
   customer statement, reports and CSV export. Point out that every figure is derived from the ledger.
6. **Driver** (`/driver`) on a phone: add to home screen, mark a collection arrived/collected.
7. **Security talking points**: role-based access, row-level security, immutable ledger, audit log.

## Demo logins
All demo customers use password `Demo@12345`: amina.demo, brian.demo, savannah.demo, greenfield.demo,
grace.demo, peter.demo (`@example.com`). Amina is fully paid, Brian part-paid, Savannah paid,
Greenfield overdue, Grace current, Peter has a draft invoice.

The script refuses to run against anything except a local database.
