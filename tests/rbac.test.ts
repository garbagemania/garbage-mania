import { describe, expect, it } from "vitest";
import { AREA_ACCESS, ROLES, roleCanAccess, ROLE_HOME_AREA, type Role } from "@/types/roles";
import {
  assertAreaAccess,
  requireRole,
  requireStaffRole,
  requireCustomer,
  requireDriver,
  AuthorizationError,
} from "@/lib/auth/rbac";
import type { AppUser } from "@/lib/auth/session";

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: "user@example.com",
    phone: null,
    role: null,
    kind: null,
    fullName: "Test User",
    status: "active",
    staffProfile: null,
    customerProfile: null,
    driver: null,
    ...overrides,
  };
}

const STAFF_ROLES_EXCEPT_DRIVER: Role[] = ["super_admin", "admin", "finance", "operations_manager"];

describe("roleCanAccess / AREA_ACCESS — every one of the six roles", () => {
  it("admin area: super_admin, admin, finance, operations_manager yes; driver, customer no", () => {
    for (const role of STAFF_ROLES_EXCEPT_DRIVER) {
      expect(roleCanAccess(role, "admin")).toBe(true);
    }
    expect(roleCanAccess("driver", "admin")).toBe(false);
    expect(roleCanAccess("customer", "admin")).toBe(false);
  });

  it("driver area: driver and super_admin yes; everyone else no", () => {
    expect(roleCanAccess("driver", "driver")).toBe(true);
    expect(roleCanAccess("super_admin", "driver")).toBe(true);
    for (const role of ["admin", "finance", "operations_manager", "customer"] as Role[]) {
      expect(roleCanAccess(role, "driver")).toBe(false);
    }
  });

  it("portal area: customer and super_admin yes; everyone else no", () => {
    expect(roleCanAccess("customer", "portal")).toBe(true);
    expect(roleCanAccess("super_admin", "portal")).toBe(true);
    for (const role of ["admin", "finance", "operations_manager", "driver"] as Role[]) {
      expect(roleCanAccess(role, "portal")).toBe(false);
    }
  });

  it("the old nine-role model is gone — exactly six roles exist", () => {
    expect(ROLES).toEqual([
      "super_admin",
      "admin",
      "finance",
      "operations_manager",
      "driver",
      "customer",
    ]);
    expect(ROLES).not.toContain("staff");
    expect(ROLES).not.toContain("support");
    expect(ROLES).not.toContain("operations");
    expect(ROLES).not.toContain("customer_individual");
    expect(ROLES).not.toContain("customer_corporate");
  });

  it("every role has exactly one home area, and can access it", () => {
    for (const role of ROLES) {
      const home = ROLE_HOME_AREA[role];
      expect(roleCanAccess(role, home)).toBe(true);
    }
  });
});

describe("assertAreaAccess", () => {
  it("passes for an allowed role", () => {
    expect(() => assertAreaAccess("finance", "admin")).not.toThrow();
  });

  it("throws AuthorizationError for a disallowed role", () => {
    expect(() => assertAreaAccess("driver", "admin")).toThrow(AuthorizationError);
  });

  it("throws for a null role (unauthenticated / no profile row yet)", () => {
    expect(() => assertAreaAccess(null, "admin")).toThrow(AuthorizationError);
  });
});

describe("requireRole", () => {
  it("passes when the user's role is in the allowed list", () => {
    const user = makeUser({ role: "operations_manager" });
    expect(() => requireRole(user, AREA_ACCESS.admin)).not.toThrow();
  });

  it("throws when the user's role is not in the allowed list", () => {
    const user = makeUser({ role: "driver" });
    expect(() => requireRole(user, AREA_ACCESS.admin)).toThrow(AuthorizationError);
  });

  it("throws when the user has no role at all", () => {
    const user = makeUser({ role: null });
    expect(() => requireRole(user, AREA_ACCESS.admin)).toThrow(AuthorizationError);
  });
});

describe("requireStaffRole", () => {
  it("passes for a staff-kind user with an allowed role", () => {
    const user = makeUser({ role: "finance", kind: "staff" });
    expect(() => requireStaffRole(user)).not.toThrow();
  });

  it("throws for a customer-kind user even if role were somehow set to a staff role", () => {
    // kind/role should never actually disagree (validate_profile_kind trigger
    // in 001_identity.sql prevents it at the database level) - this asserts
    // the application-layer guard is defense in depth for that same rule.
    const user = makeUser({ role: "finance", kind: "customer" });
    expect(() => requireStaffRole(user)).toThrow(AuthorizationError);
  });

  it("can be narrowed to a subset of staff roles", () => {
    const financeUser = makeUser({ role: "finance", kind: "staff" });
    const opsUser = makeUser({ role: "operations_manager", kind: "staff" });
    expect(() => requireStaffRole(financeUser, ["finance"])).not.toThrow();
    expect(() => requireStaffRole(opsUser, ["finance"])).toThrow(AuthorizationError);
  });
});

describe("requireCustomer", () => {
  it("returns the customer_id for a valid customer account", () => {
    const user = makeUser({
      role: "customer",
      kind: "customer",
      customerProfile: { customerId: "cust-123", isPrimaryContact: true },
    });
    expect(requireCustomer(user)).toBe("cust-123");
  });

  it("throws for a staff account", () => {
    const user = makeUser({ role: "admin", kind: "staff" });
    expect(() => requireCustomer(user)).toThrow(AuthorizationError);
  });

  it("throws for a customer-role user with no linked customer_profiles row", () => {
    const user = makeUser({ role: "customer", kind: "customer", customerProfile: null });
    expect(() => requireCustomer(user)).toThrow(AuthorizationError);
  });
});

describe("requireDriver", () => {
  it("returns driver info for a valid driver account", () => {
    const user = makeUser({
      role: "driver",
      kind: "staff",
      driver: { licenseNumber: "DL-1", status: "active" },
    });
    expect(requireDriver(user)).toEqual({ licenseNumber: "DL-1", status: "active" });
  });

  it("throws for a non-driver role", () => {
    const user = makeUser({ role: "operations_manager", kind: "staff" });
    expect(() => requireDriver(user)).toThrow(AuthorizationError);
  });

  it("throws for role=driver with no linked drivers row (data inconsistency)", () => {
    const user = makeUser({ role: "driver", kind: "staff", driver: null });
    expect(() => requireDriver(user)).toThrow(AuthorizationError);
  });
});

describe("changing/removing a profile's role changes authorization", () => {
  it("a role downgrade removes access that was previously granted", () => {
    const beforeDemotion = makeUser({ role: "admin", kind: "staff" });
    expect(() => requireRole(beforeDemotion, AREA_ACCESS.admin)).not.toThrow();

    // Simulates profiles.role_id being changed to 'driver' - the same
    // AppUser shape, freshly re-resolved, now fails the same check. There
    // is no caching in requireRole/AppUser that could let the old role
    // persist across this change.
    const afterDemotion = makeUser({ role: "driver", kind: "staff" });
    expect(() => requireRole(afterDemotion, AREA_ACCESS.admin)).toThrow(AuthorizationError);
  });

  it("a removed profile (role: null) is treated as no access, not default access", () => {
    const afterRemoval = makeUser({ role: null, kind: null });
    expect(() => requireRole(afterRemoval, AREA_ACCESS.admin)).toThrow(AuthorizationError);
    expect(() => requireStaffRole(afterRemoval)).toThrow(AuthorizationError);
    expect(() => requireCustomer(afterRemoval)).toThrow(AuthorizationError);
    expect(() => requireDriver(afterRemoval)).toThrow(AuthorizationError);
  });
});

describe("financeCanAccessPath", () => {
  it("matches whole path segments only", async () => {
    const { financeCanAccessPath } = await import("@/types/roles");
    expect(financeCanAccessPath("/admin/finance")).toBe(true);
    expect(financeCanAccessPath("/admin/finance/reports")).toBe(true);
    expect(financeCanAccessPath("/admin/finance-other")).toBe(false);
    expect(financeCanAccessPath("/admin")).toBe(false);
    expect(financeCanAccessPath("/admin/customers")).toBe(false);
    expect(financeCanAccessPath("/driver")).toBe(false);
  });
});
