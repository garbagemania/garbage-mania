import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_STAFF_ROLES,
  FINANCE_DELETERS,
  STAFF_MANAGERS,
  STAFF_ROLES,
  financeCanAccessPath,
} from "@/types/roles";
import { ADMIN_NAV, navForRole } from "@/config/admin-nav";

describe("delete and staff-management permissions", () => {
  it("finance cannot delete; super admin and admin can", () => {
    expect(FINANCE_DELETERS).toEqual(["super_admin", "admin"]);
    expect(FINANCE_DELETERS).not.toContain("finance");
    expect(FINANCE_DELETERS).not.toContain("operations_manager");
  });

  it("only the super admin manages staff", () => {
    expect(STAFF_MANAGERS).toEqual(["super_admin"]);
  });

  it("customers can never be assigned as staff", () => {
    expect(ASSIGNABLE_STAFF_ROLES).not.toContain("customer");
    expect([...ASSIGNABLE_STAFF_ROLES].sort()).toEqual([...STAFF_ROLES].sort());
  });

  it("the Staff screen is in the nav for super admin only", () => {
    const staff = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.href === "/admin/staff");
    expect(staff?.roles).toEqual(["super_admin"]);
    for (const role of ["admin", "finance", "operations_manager"] as const) {
      const hrefs = navForRole(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).not.toContain("/admin/staff");
    }
  });

  it("finance is bounced from /admin/staff but may change its own password", () => {
    expect(financeCanAccessPath("/admin/staff")).toBe(false);
    expect(financeCanAccessPath("/admin/staff/new")).toBe(false);
    expect(financeCanAccessPath("/admin/account")).toBe(true);
  });
});
