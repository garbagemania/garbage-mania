import type { Role } from "@/types/roles";

export interface AdminNavItem {
  label: string;
  /** Every item must point at a real page (enforced by tests/admin-nav.test.ts). */
  href: string;
  /** Roles allowed to see this item at all. */
  roles: Role[];
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/**
 * The admin sidebar's full information architecture, matching the
 * super_admin/admin, operations_manager, and finance groupings from the
 * product brief. Every item is visible only to the roles listed in
 * `roles` — but visibility alone is not the security boundary (see
 * BUSINESS_SCHEMA.md §D / 011_rls_policies.sql, which enforce the same
 * scoping at the database layer regardless of what this file renders).
 *
 * Every item has a real page; tests/admin-nav.test.ts fails if one does not.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/admin/dashboard",
        roles: ["super_admin", "admin", "operations_manager"],
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        label: "Customers",
        href: "/admin/customers",
        roles: ["super_admin", "admin", "operations_manager"],
      },
      {
        label: "Approvals",
        href: "/admin/customer-approvals",
        roles: ["super_admin"],
      },
      {
        label: "Properties",
        href: "/admin/properties",
        roles: ["super_admin", "admin", "operations_manager"],
      },
    ],
  },
  {
    label: "Service",
    items: [
      {
        label: "Service Plans",
        href: "/admin/service-plans",
        roles: ["super_admin", "admin"],
      },
      {
        label: "Subscriptions",
        href: "/admin/subscriptions",
        roles: ["super_admin", "admin", "operations_manager"],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Collections",
        href: "/admin/collections",
        roles: ["super_admin", "admin", "operations_manager"],
      },
      {
        label: "Service requests",
        href: "/admin/requests",
        roles: ["super_admin", "admin", "operations_manager"],
      },
      {
        label: "Routes",
        href: "/admin/routes",
        roles: ["super_admin", "admin", "operations_manager"],
      },
      {
        label: "Drivers",
        href: "/admin/drivers",
        roles: ["super_admin", "admin", "operations_manager"],
      },
      {
        label: "Vehicles",
        href: "/admin/vehicles",
        roles: ["super_admin", "admin", "operations_manager"],
      },
      {
        label: "Operational events",
        href: "/admin/operational-events",
        roles: ["super_admin", "admin"],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Finance dashboard",
        href: "/admin/finance",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Customer accounts",
        href: "/admin/finance/customers",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Unallocated payments",
        href: "/admin/finance/payments/unallocated",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Finance reports",
        href: "/admin/finance/reports",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Invoices",
        href: "/admin/invoices",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Payments",
        href: "/admin/payments",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "M-Pesa",
        href: "/admin/mpesa",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Receipts",
        href: "/admin/receipts",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Refunds",
        href: "/admin/refunds",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Reconciliation",
        href: "/admin/reconciliation",
        roles: ["super_admin", "admin", "finance"],
      },
      {
        label: "Customer statements",
        href: "/admin/statements",
        roles: ["super_admin", "admin", "finance"],
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Notifications",
        href: "/admin/notifications",
        roles: ["super_admin", "admin"],
      },
      {
        label: "Staff",
        href: "/admin/staff",
        roles: ["super_admin"],
      },
      {
        label: "Audit",
        href: "/admin/audit",
        roles: ["super_admin", "admin"],
      },
    ],
  },
];

/** Returns only the groups/items a given role is allowed to see, dropping empty groups. */
export function navForRole(role: Role): AdminNavGroup[] {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
