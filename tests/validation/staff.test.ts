import { describe, expect, it } from "vitest";
import {
  changeOwnPasswordSchema,
  changeRoleSchema,
  createStaffSchema,
  resetPasswordSchema,
  staffStatusSchema,
} from "@/lib/validation/staff";

const base = {
  fullName: "Jane Wanjiru",
  email: "Jane@GarbageMania.co.ke",
  role: "operations_manager",
  password: "a-long-password-1",
};

describe("createStaffSchema", () => {
  it("accepts a valid non-driver and lowercases the email", () => {
    const r = createStaffSchema.safeParse({ ...base, phone: "", licenseNumber: "", licenseExpiry: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("jane@garbagemania.co.ke");
      expect(r.data.phone).toBeUndefined();
    }
  });

  it("rejects the customer role", () => {
    expect(createStaffSchema.safeParse({ ...base, role: "customer" }).success).toBe(false);
  });

  it("rejects a short password", () => {
    expect(createStaffSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
  });

  it("rejects an invalid phone number", () => {
    expect(createStaffSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });

  it("requires licence details for a driver", () => {
    expect(createStaffSchema.safeParse({ ...base, role: "driver" }).success).toBe(false);
    expect(
      createStaffSchema.safeParse({ ...base, role: "driver", licenseNumber: "DL-123", licenseExpiry: "2028-01-31" }).success,
    ).toBe(true);
  });
});

describe("changeRoleSchema", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  it("accepts a role change without licence details", () => {
    expect(changeRoleSchema.safeParse({ userId, role: "finance" }).success).toBe(true);
  });
  it("rejects customer and unknown roles", () => {
    expect(changeRoleSchema.safeParse({ userId, role: "customer" }).success).toBe(false);
    expect(changeRoleSchema.safeParse({ userId, role: "root" }).success).toBe(false);
  });
  it("rejects a licence number without an expiry", () => {
    expect(changeRoleSchema.safeParse({ userId, role: "driver", licenseNumber: "DL-1" }).success).toBe(false);
  });
});

describe("staffStatusSchema / resetPasswordSchema / changeOwnPasswordSchema", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  it("only allows suspend or reactivate", () => {
    expect(staffStatusSchema.safeParse({ userId, intent: "suspend" }).success).toBe(true);
    expect(staffStatusSchema.safeParse({ userId, intent: "delete" }).success).toBe(false);
  });
  it("enforces the minimum password length on reset", () => {
    expect(resetPasswordSchema.safeParse({ userId, password: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ userId, password: "twelve-chars!" }).success).toBe(true);
  });
  it("requires the two passwords to match", () => {
    expect(changeOwnPasswordSchema.safeParse({ password: "twelve-chars!", confirm: "different-one!" }).success).toBe(false);
    expect(changeOwnPasswordSchema.safeParse({ password: "twelve-chars!", confirm: "twelve-chars!" }).success).toBe(true);
  });
});
