import { describe, expect, it } from "vitest";
import { formatKES } from "@/lib/utils";
import { kenyanPhoneSchema } from "@/lib/validation/common";
import { roleCanAccess } from "@/types/roles";

describe("utils", () => {
  it("formats KES currency", () => {
    expect(formatKES(1500)).toContain("1,500.00");
  });
});

describe("validation", () => {
  it("accepts a valid Kenyan phone number", () => {
    expect(kenyanPhoneSchema.safeParse("0712345678").success).toBe(true);
    expect(kenyanPhoneSchema.safeParse("+254712345678").success).toBe(true);
  });

  it("rejects an invalid phone number", () => {
    expect(kenyanPhoneSchema.safeParse("12345").success).toBe(false);
  });
});

describe("rbac", () => {
  it("only lets driver/super_admin into the driver area", () => {
    expect(roleCanAccess("driver", "driver")).toBe(true);
    expect(roleCanAccess("customer", "driver")).toBe(false);
  });
});
