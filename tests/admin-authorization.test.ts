import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/lib/auth/rbac";

/**
 * Verifies that admin server actions enforce authorization BEFORE ever
 * touching the database - the Supabase client mock below throws if any
 * of its query-builder methods are called, so a test only passes if the
 * action's requireStaffRole() check runs (and rejects) first. This is a
 * unit-level proof of "authorization enforced server-side," not a live
 * RLS test - RLS itself is covered by supabase/tests/*.sql (unexecuted in
 * this sandbox, see MIGRATION_REVIEW.md/PHASE_3_ADMIN_REVIEW.md).
 */

const requireAuthenticatedUserMock = vi.fn();
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireAuthenticatedUser: requireAuthenticatedUserMock };
});

const redirectMock = vi.fn(() => {
  throw new Error("NEXT_REDIRECT_MARKER");
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function neverCalledSupabase() {
  const fail = () => {
    throw new Error("Supabase client should not be reached before authorization passes");
  };
  return {
    from: () => ({
      insert: fail,
      update: fail,
      select: fail,
    }),
    rpc: fail,
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() => neverCalledSupabase()),
}));

function makeUser(role: string | null, kind: "staff" | "customer" | null = "staff") {
  return {
    id: "u1",
    email: "user@example.com",
    phone: null,
    role,
    kind,
    fullName: "Test User",
    status: "active",
    staffProfile: null,
    customerProfile: null,
    driver: null,
  };
}

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  requireAuthenticatedUserMock.mockReset();
  redirectMock.mockClear();
});

describe("createCustomer authorization (only super_admin/admin)", () => {
  it("rejects finance before touching the database", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("finance"));
    const { createCustomer } = await import("@/app/admin/customers/actions");
    await expect(
      createCustomer(formData({ customerType: "individual", displayName: "Jane" })),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects operations_manager before touching the database", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("operations_manager"));
    const { createCustomer } = await import("@/app/admin/customers/actions");
    await expect(
      createCustomer(formData({ customerType: "individual", displayName: "Jane" })),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects driver before touching the database", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("driver"));
    const { createCustomer } = await import("@/app/admin/customers/actions");
    await expect(
      createCustomer(formData({ customerType: "individual", displayName: "Jane" })),
    ).rejects.toThrow(AuthorizationError);
  });

  it("rejects an unauthenticated-shaped user (role: null)", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser(null, null));
    const { createCustomer } = await import("@/app/admin/customers/actions");
    await expect(
      createCustomer(formData({ customerType: "individual", displayName: "Jane" })),
    ).rejects.toThrow(AuthorizationError);
  });

  it("lets admin past authorization and reach the (mocked) database call", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("admin"));
    const { createCustomer } = await import("@/app/admin/customers/actions");
    // The mocked Supabase client throws its own distinct error the moment
    // any query-builder method is called - reaching THAT error (not
    // AuthorizationError) proves the admin role got past the auth check.
    await expect(
      createCustomer(formData({ customerType: "individual", displayName: "Jane" })),
    ).rejects.toThrow("Supabase client should not be reached before authorization passes");
  });
});

describe("updateCustomer authorization (only super_admin/admin)", () => {
  it("rejects finance", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("finance"));
    const { updateCustomer } = await import("@/app/admin/customers/actions");
    await expect(
      updateCustomer("cust-1", formData({ customerType: "individual", displayName: "Jane" })),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe("createProperty / createServiceAddress / createCustomerContact authorization", () => {
  it("createProperty allows operations_manager but rejects finance", async () => {
    const { createProperty } = await import("@/app/admin/customers/actions");

    requireAuthenticatedUserMock.mockResolvedValue(makeUser("finance"));
    await expect(
      createProperty("cust-1", formData({ propertyType: "residential", addressLine: "1 Rd", county: "Nairobi" })),
    ).rejects.toThrow(AuthorizationError);

    requireAuthenticatedUserMock.mockResolvedValue(makeUser("operations_manager"));
    await expect(
      createProperty("cust-1", formData({ propertyType: "residential", addressLine: "1 Rd", county: "Nairobi" })),
    ).rejects.toThrow("Supabase client should not be reached before authorization passes");
  });

  it("createCustomerContact rejects operations_manager (contacts are admin-only)", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("operations_manager"));
    const { createCustomerContact } = await import("@/app/admin/customers/actions");
    await expect(createCustomerContact("cust-1", formData({ fullName: "John" }))).rejects.toThrow(
      AuthorizationError,
    );
  });
});

describe("service plan authorization (super_admin/admin only; finance is finance-screens only)", () => {
  it("rejects operations_manager and driver", async () => {
    const { createServicePlan } = await import("@/app/admin/service-plans/actions");
    const payload = formData({
      code: "X",
      name: "X",
      wasteType: "general",
      defaultFrequency: "weekly",
      priceKes: "100",
    });

    requireAuthenticatedUserMock.mockResolvedValue(makeUser("operations_manager"));
    await expect(createServicePlan(payload)).rejects.toThrow(AuthorizationError);

    requireAuthenticatedUserMock.mockResolvedValue(makeUser("driver"));
    await expect(createServicePlan(payload)).rejects.toThrow(AuthorizationError);
  });

  it("rejects finance (the accountant only has the finance screens)", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("finance"));
    const { createServicePlan } = await import("@/app/admin/service-plans/actions");
    await expect(
      createServicePlan(
        formData({ code: "X", name: "X", wasteType: "general", defaultFrequency: "weekly", priceKes: "100" }),
      ),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe("subscription authorization (super_admin/admin create; operations_manager and finance are blocked)", () => {
  it("createSubscription rejects operations_manager", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("operations_manager"));
    const { createSubscription } = await import("@/app/admin/subscriptions/actions");
    await expect(
      createSubscription(
        "cust-1",
        formData({
          contractId: "11111111-1111-1111-1111-111111111111",
          serviceAddressId: "11111111-1111-1111-1111-111111111111",
          servicePlanId: "11111111-1111-1111-1111-111111111111",
          frequency: "weekly",
          startDate: "2026-01-01",
        }),
      ),
    ).rejects.toThrow(AuthorizationError);
  });

  it("changeSubscriptionStatus rejects driver and customer-kind users", async () => {
    const { changeSubscriptionStatus } = await import("@/app/admin/subscriptions/actions");

    requireAuthenticatedUserMock.mockResolvedValue(makeUser("driver"));
    await expect(changeSubscriptionStatus("sub-1", formData({ status: "active" }))).rejects.toThrow(
      AuthorizationError,
    );

    requireAuthenticatedUserMock.mockResolvedValue(makeUser("customer", "customer"));
    await expect(changeSubscriptionStatus("sub-1", formData({ status: "active" }))).rejects.toThrow(
      AuthorizationError,
    );
  });
});

describe("collection authorization (only super_admin/operations_manager may transition status)", () => {
  it("rejects finance and admin (read-only for collections status changes)", async () => {
    const { changeCollectionStatus } = await import("@/app/admin/collections/actions");

    requireAuthenticatedUserMock.mockResolvedValue(makeUser("finance"));
    await expect(changeCollectionStatus("col-1", formData({ status: "assigned" }))).rejects.toThrow(
      AuthorizationError,
    );

    requireAuthenticatedUserMock.mockResolvedValue(makeUser("admin"));
    await expect(changeCollectionStatus("col-1", formData({ status: "assigned" }))).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("allows operations_manager past authorization", async () => {
    requireAuthenticatedUserMock.mockResolvedValue(makeUser("operations_manager"));
    const { changeCollectionStatus } = await import("@/app/admin/collections/actions");
    await expect(changeCollectionStatus("col-1", formData({ status: "assigned" }))).rejects.toThrow(
      "Supabase client should not be reached before authorization passes",
    );
  });
});
