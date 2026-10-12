/**
 * Roles are the shared vocabulary for the whole app, and MUST stay in sync
 * with `public.roles` (supabase/migrations/001_identity.sql) and the role
 * access matrix enforced by RLS in supabase/migrations/011_rls_policies.sql
 * and documented in BUSINESS_SCHEMA.md §D / "Role access summary".
 *
 * These are the six canonical roles — approved architecture decision, do
 * not reintroduce the old nine-role model (staff/support/operations/
 * customer_individual/customer_corporate). Individual vs corporate
 * customers are distinguished by `customers.customer_type` in the
 * database, never by a separate role.
 */
export const ROLES = [
  "super_admin",
  "admin",
  "finance",
  "operations_manager",
  "driver",
  "customer",
] as const;

export type Role = (typeof ROLES)[number];

/** Roles whose accounts are staff (kind = 'staff' in profiles), i.e. every role but customer. */
export const STAFF_ROLES: Role[] = [
  "super_admin",
  "admin",
  "finance",
  "operations_manager",
  "driver",
];

/**
 * Route areas and which roles may enter them. Checked in middleware
 * (src/middleware.ts) for routing/UX, and re-checked server-side
 * (src/lib/auth/rbac.ts) as the real enforcement layer for anything that
 * reads or writes data — Postgres RLS is the final, authoritative boundary
 * underneath both (supabase/migrations/011_rls_policies.sql).
 *
 * Finance and operations_manager both enter through /admin — there is no
 * separate /finance or /operations area; in-app feature permissions, not
 * a different URL area, are what scope what they see inside /admin.
 */
export const AREA_ACCESS = {
  admin: ["super_admin", "admin", "finance", "operations_manager"] as Role[],
  driver: ["driver", "super_admin"] as Role[],
  portal: ["customer", "super_admin"] as Role[],
} as const;

export type Area = keyof typeof AREA_ACCESS;

/** The route area a role lands on immediately after signing in. */
export const ROLE_HOME_AREA: Record<Role, Area> = {
  super_admin: "admin",
  admin: "admin",
  finance: "admin",
  operations_manager: "admin",
  driver: "driver",
  customer: "portal",
};

export function roleCanAccess(role: Role, area: Area): boolean {
  return AREA_ACCESS[area].includes(role);
}

/**
 * The `finance` role (the accountant) is confined to the finance screens
 * ONLY. It still enters through /admin (there is no separate URL area), but
 * middleware (src/middleware.ts) bounces it from every /admin path that is
 * not on this list. Matching is by whole path segment, so "/admin/finance"
 * allows "/admin/finance/reports" but not "/admin/finance-anything-else".
 *
 * Keep in sync with the "Finance" group in src/config/admin-nav.ts.
 */
export const FINANCE_ALLOWED_PREFIXES = [
  "/admin/finance",
  "/admin/invoices",
  "/admin/payments",
  "/admin/mpesa",
  "/admin/receipts",
  "/admin/refunds",
  "/admin/reconciliation",
  "/admin/statements",
  "/admin/account", // every staff member may change their own password
] as const;

/** Where the finance role lands after signing in (and when bounced). */
export const FINANCE_HOME_PATH = "/admin/finance";

export function financeCanAccessPath(pathname: string): boolean {
  return FINANCE_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Who may DELETE records. Finance can record, verify, allocate, issue and
 * cancel (a reversal that stays on the audit trail), but cannot delete.
 * Enforced in the database by require_finance_deleter() (migration 022);
 * this list drives the UI and the Server Action pre-check.
 */
export const FINANCE_DELETERS: Role[] = ["super_admin", "admin"];

/**
 * Who may manage staff accounts (create, change role, suspend, reset
 * password). Super admin only: an ordinary admin could otherwise promote
 * themselves. Enforced in the database by require_super_admin().
 */
export const STAFF_MANAGERS: Role[] = ["super_admin"];

/** Roles a staff account can be given (everything except customer). */
export const ASSIGNABLE_STAFF_ROLES = [
  "super_admin",
  "admin",
  "finance",
  "operations_manager",
  "driver",
] as const;
