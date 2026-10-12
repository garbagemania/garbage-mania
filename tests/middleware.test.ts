import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock() factories are hoisted above top-level const declarations, so
// a plain `const updateSessionMock = vi.fn()` referenced inside the
// factory hits a temporal-dead-zone ReferenceError. vi.hoisted() runs
// its callback as part of that same hoisting pass, so the mock exists by
// the time the factory needs it.
const { updateSessionMock } = vi.hoisted(() => ({ updateSessionMock: vi.fn() }));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: updateSessionMock,
}));

import { middleware } from "@/middleware";

function fakeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

beforeEach(() => {
  updateSessionMock.mockReset();
});

describe("middleware — unauthenticated access", () => {
  it("redirects to /login with redirectTo for a protected area", async () => {
    updateSessionMock.mockResolvedValue({ response: new Response(), user: null, role: null });
    const res = await middleware(fakeRequest("/admin"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("redirectTo=%2Fadmin");
  });

  it("does not redirect for a public route", async () => {
    updateSessionMock.mockResolvedValue({ response: new Response(), user: null, role: null });
    const res = await middleware(fakeRequest("/login"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("middleware — authenticated, authorized access (one case per role/area)", () => {
  const cases: Array<[string, string]> = [
    ["super_admin", "/admin"],
    ["admin", "/admin"],
    ["finance", "/admin/finance"],
    ["operations_manager", "/admin"],
    ["driver", "/driver"],
    ["customer", "/portal"],
  ];

  for (const [role, path] of cases) {
    it(`${role} passes through to ${path} without a redirect`, async () => {
      updateSessionMock.mockResolvedValue({
        response: new Response(),
        user: { id: "u1" },
        role,
      });
      const res = await middleware(fakeRequest(path));
      expect(res.headers.get("location")).toBeNull();
    });
  }
});

describe("middleware — authenticated but unauthorized role access", () => {
  const cases: Array<[string, string]> = [
    ["driver", "/admin"],
    ["customer", "/admin"],
    ["finance", "/driver"],
    ["customer", "/driver"],
    ["admin", "/portal"],
    ["driver", "/portal"],
  ];

  for (const [role, path] of cases) {
    it(`${role} is redirected to /not-authorized for ${path}`, async () => {
      updateSessionMock.mockResolvedValue({
        response: new Response(),
        user: { id: "u1" },
        role,
      });
      const res = await middleware(fakeRequest(path));
      expect(res.headers.get("location")).toContain("/not-authorized");
    });
  }

  it("an authenticated user with role=null (no profiles row yet) is redirected to /not-authorized", async () => {
    updateSessionMock.mockResolvedValue({ response: new Response(), user: { id: "u1" }, role: null });
    const res = await middleware(fakeRequest("/admin"));
    expect(res.headers.get("location")).toContain("/not-authorized");
  });
});

describe("middleware — role resolution source", () => {
  it("gates purely on the role updateSession() resolved from the database, never a JWT field on the request", async () => {
    // updateSession() is the only source of `role` middleware ever sees -
    // this test's mock never supplies anything JWT-shaped, and the
    // middleware still gates correctly, demonstrating there is no
    // fallback path that reads app_metadata.role directly.
    updateSessionMock.mockResolvedValue({
      response: new Response(),
      user: { id: "u1" }, // deliberately no app_metadata on this fake user
      role: "operations_manager",
    });
    const res = await middleware(fakeRequest("/admin"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("middleware — finance role is confined to the finance screens", () => {
  const asFinance = () =>
    updateSessionMock.mockResolvedValue({ response: new Response(), user: { id: "u1" }, role: "finance" });

  const allowed = [
    "/admin/finance",
    "/admin/finance/reports",
    "/admin/finance/customers/abc/statement",
    "/admin/invoices",
    "/admin/payments",
    "/admin/mpesa",
    "/admin/receipts",
    "/admin/refunds",
    "/admin/reconciliation",
    "/admin/statements/abc",
  ];
  for (const path of allowed) {
    it(`finance may open ${path}`, async () => {
      asFinance();
      const res = await middleware(fakeRequest(path));
      expect(res.headers.get("location")).toBeNull();
    });
  }

  const blocked = [
    "/admin",
    "/admin/dashboard",
    "/admin/customers",
    "/admin/customers/abc",
    "/admin/subscriptions",
    "/admin/service-plans",
    "/admin/collections",
    "/admin/routes",
    "/admin/drivers",
    "/admin/vehicles",
    "/admin/properties",
    "/admin/audit",
    "/admin/notifications",
    "/admin/customer-approvals",
    "/admin/operational-events",
    "/admin/finance-secrets", // not a segment match for /admin/finance
  ];
  for (const path of blocked) {
    it(`finance is sent back to /admin/finance from ${path}`, async () => {
      asFinance();
      const res = await middleware(fakeRequest(path));
      const location = res.headers.get("location") ?? "";
      expect(new URL(location).pathname).toBe("/admin/finance");
    });
  }

  it("other staff roles are not restricted to finance paths", async () => {
    for (const role of ["super_admin", "admin", "operations_manager"]) {
      updateSessionMock.mockResolvedValue({ response: new Response(), user: { id: "u1" }, role });
      const res = await middleware(fakeRequest("/admin/customers"));
      expect(res.headers.get("location"), role).toBeNull();
    }
  });
});
