# Staff management

Super admin only: **Admin → System → Staff** (`/admin/staff`).

| Action | Where | Rule |
|---|---|---|
| Add a staff member | `/admin/staff/new` | Creates the login (Auth admin API) and, in one database transaction, the profile, staff record and (for drivers) the driver record. If any step fails the login is removed again. |
| Change role | `/admin/staff/<id>` | Not on yourself. Not for the last active super admin. Moving off `driver` keeps the driver row (history) and marks it inactive; moving onto `driver` needs a licence number and expiry the first time. |
| Suspend / reactivate | `/admin/staff/<id>` | Not on yourself. Not the last active super admin. Sets the profile `suspended`, bans the login in Supabase Auth, and middleware blocks any non-active account on its next request. Nothing is deleted. |
| Reset password | `/admin/staff/<id>` | Super admin types or generates a new password (min 12). Not for yourself. |
| Change my password | `/admin/account` ("My password" in the header) | Any staff member, including the accountant. |

## Why these rules live in the database

`supabase/migrations/022_admin_delete_and_staff_management.sql` holds the
rules (`provision_staff`, `set_staff_role`, `set_staff_status`, all
`require_super_admin()`), so they apply no matter which code path calls them.
It also closes a gap in `profiles_update_self`/`profiles_update_staff` (011):
any signed-in user could previously change their own `role_id`/`status`, and
`admin` could promote itself. A trigger now allows those columns to change
only for a super admin, never on their own row. Scripts using the service role
are unaffected.

Business rows are written with the signed-in super admin's own session, so the
audit log records who did it. The service-role key is used only for the Auth
admin API, so `SUPABASE_SERVICE_ROLE_KEY` must be set in the **server**
environment (never `NEXT_PUBLIC_`).

## Known limits

- No email invites or forgot-password flow yet (needs SMTP). The super admin
  hands over the initial password; the person changes it under "My password".
- A reset or initial password is not forced to be changed on first sign-in.
- A role change applies on the next request, but an already-issued access
  token stays valid for up to its lifetime for *Supabase API* calls (RLS still
  uses the live role, so database access follows the new role immediately).
- Two-factor sign-in for the accountant is not built.

## What is and is not built

Built: auth and roles, customers, plans, subscriptions, collections, driver
page, customer portal, finance (invoices, payments, allocation, credit notes,
refunds, reports), staff management.

Also built: customer collection requests are reviewed at `/admin/requests` (approve creates a one-off collection; reject needs a reason the customer sees in their portal).

Not built yet: M-Pesa STK push and callback, route/vehicle/driver setup and
collection scheduling, SMS/email/WhatsApp sending, PDF documents, bank/M-Pesa
reconciliation matching, hosted deployment and CI.
