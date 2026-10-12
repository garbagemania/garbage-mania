import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the server Supabase client factory before importing session.ts, so
// getCurrentUser() runs against a fake client instead of real
// next/headers cookies()/network calls - this file tests the *resolution
// logic* (role/kind/staffProfile/customerProfile/driver assembly from
// query results), not a live database. Live RLS behavior is covered by
// supabase/tests/*.sql (pgTAP - see MIGRATION_REVIEW.md for run status).
const getUserMock = vi.fn();

type FixtureRow = Record<string, unknown> | null;

function makeFakeSupabase(fixtures: {
  authUser: { id: string; email?: string; phone?: string } | null;
  profiles?: FixtureRow;
  roles?: FixtureRow;
  staff_profiles?: FixtureRow;
  customer_profiles?: FixtureRow;
  drivers?: FixtureRow;
}) {
  getUserMock.mockResolvedValue({ data: { user: fixtures.authUser } });

  return {
    auth: { getUser: getUserMock },
    from(table: keyof typeof fixtures) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: fixtures[table] ?? null, error: null }),
          }),
        }),
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, requireAuthenticatedUser, AuthenticationError } from "@/lib/auth/session";

const mockedCreateClient = vi.mocked(createSupabaseServerClient);

beforeEach(() => {
  getUserMock.mockReset();
  mockedCreateClient.mockReset();
});

describe("getCurrentUser — unauthenticated", () => {
  it("returns null when there is no Supabase Auth session", async () => {
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({ authUser: null }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("getCurrentUser — authenticated with no profiles row yet", () => {
  it("returns a user with role/kind null rather than defaulting to any access", async () => {
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({
        authUser: { id: "u1", email: "new@example.com" },
        profiles: null,
      }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );

    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user?.role).toBeNull();
    expect(user?.kind).toBeNull();
  });
});

describe("getCurrentUser — staff account resolution", () => {
  it("resolves role from the profiles->roles join and attaches staffProfile", async () => {
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({
        authUser: { id: "u2", email: "finance@example.com" },
        profiles: {
          kind: "staff",
          full_name: "Finance Person",
          phone: null,
          status: "active",
          role_id: "role-1",
        },
        roles: { code: "finance" },
        staff_profiles: { employee_number: "GM-0042", department: "Finance", is_active: true },
      }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );

    const user = await getCurrentUser();
    expect(user?.role).toBe("finance");
    expect(user?.kind).toBe("staff");
    expect(user?.staffProfile).toEqual({
      employeeNumber: "GM-0042",
      department: "Finance",
      isActive: true,
    });
    expect(user?.customerProfile).toBeNull();
    expect(user?.driver).toBeNull();
  });

  it("also resolves the drivers row when role is driver", async () => {
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({
        authUser: { id: "u3" },
        profiles: {
          kind: "staff",
          full_name: "Driver Person",
          phone: null,
          status: "active",
          role_id: "role-1",
        },
        roles: { code: "driver" },
        staff_profiles: { employee_number: "GM-0100", department: null, is_active: true },
        drivers: { license_number: "DL-99", status: "active" },
      }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );

    const user = await getCurrentUser();
    expect(user?.role).toBe("driver");
    expect(user?.driver).toEqual({ licenseNumber: "DL-99", status: "active" });
  });
});

describe("getCurrentUser — customer account resolution", () => {
  it("resolves role=customer and attaches customerProfile, not staffProfile", async () => {
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({
        authUser: { id: "u4" },
        profiles: {
          kind: "customer",
          full_name: "A Customer",
          phone: "0712345678",
          status: "active",
          role_id: "role-1",
        },
        roles: { code: "customer" },
        customer_profiles: { customer_id: "cust-1", is_primary_contact: true },
      }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );

    const user = await getCurrentUser();
    expect(user?.role).toBe("customer");
    expect(user?.kind).toBe("customer");
    expect(user?.customerProfile).toEqual({ customerId: "cust-1", isPrimaryContact: true });
    expect(user?.staffProfile).toBeNull();
  });
});

describe("getCurrentUser — no caching across calls (role change takes effect immediately)", () => {
  it("a second call reflecting a demoted/removed role returns the new role, not the old one", async () => {
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({
        authUser: { id: "u5" },
        profiles: {
          kind: "staff",
          full_name: "Someone",
          phone: null,
          status: "active",
          role_id: "role-1",
        },
        roles: { code: "admin" },
      }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );
    const before = await getCurrentUser();
    expect(before?.role).toBe("admin");

    // Simulate the role being changed in the database between requests -
    // a fresh mock, as a fresh DB read would return.
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({
        authUser: { id: "u5" },
        profiles: {
          kind: "staff",
          full_name: "Someone",
          phone: null,
          status: "active",
          role_id: "role-1",
        },
        roles: { code: "driver" },
      }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );
    const after = await getCurrentUser();
    expect(after?.role).toBe("driver");
  });
});

describe("requireAuthenticatedUser", () => {
  it("throws AuthenticationError when there is no session", async () => {
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({ authUser: null }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );
    await expect(requireAuthenticatedUser()).rejects.toThrow(AuthenticationError);
  });

  it("returns the resolved user when there is a session", async () => {
    mockedCreateClient.mockReturnValue(
      makeFakeSupabase({
        authUser: { id: "u6" },
        profiles: {
          kind: "staff",
          full_name: "Ops Person",
          phone: null,
          status: "active",
          role_id: "role-1",
        },
        roles: { code: "operations_manager" },
      }) as unknown as ReturnType<typeof createSupabaseServerClient>,
    );
    const user = await requireAuthenticatedUser();
    expect(user.role).toBe("operations_manager");
  });
});
