import { describe, expect, it } from "vitest";
import {
  customerFormSchema,
  propertyFormSchema,
  serviceAddressFormSchema,
  customerContactFormSchema,
} from "@/lib/validation/customers";

describe("customerFormSchema", () => {
  it("accepts a minimal valid individual customer", () => {
    const result = customerFormSchema.safeParse({
      customerType: "individual",
      displayName: "Jane Wanjiru",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a corporate customer with a KRA PIN and billing details", () => {
    const result = customerFormSchema.safeParse({
      customerType: "corporate",
      displayName: "Acme Ltd",
      kraPin: "P051234567X",
      billingEmail: "billing@acme.co.ke",
      billingPhone: "0712345678",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing display name", () => {
    const result = customerFormSchema.safeParse({ customerType: "individual", displayName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid customer type", () => {
    const result = customerFormSchema.safeParse({ customerType: "business", displayName: "Acme" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed billing email when provided", () => {
    const result = customerFormSchema.safeParse({
      customerType: "individual",
      displayName: "Jane",
      billingEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed Kenyan phone number when provided", () => {
    const result = customerFormSchema.safeParse({
      customerType: "individual",
      displayName: "Jane",
      billingPhone: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("allows billingEmail/billingPhone to be omitted entirely", () => {
    const result = customerFormSchema.safeParse({ customerType: "individual", displayName: "Jane" });
    expect(result.success).toBe(true);
  });
});

describe("propertyFormSchema", () => {
  it("accepts a minimal valid property", () => {
    const result = propertyFormSchema.safeParse({
      propertyType: "residential",
      addressLine: "123 Test Rd",
      county: "Nairobi",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing address line", () => {
    const result = propertyFormSchema.safeParse({ propertyType: "residential", addressLine: "", county: "Nairobi" });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range latitude", () => {
    const result = propertyFormSchema.safeParse({
      propertyType: "residential",
      addressLine: "123 Test Rd",
      county: "Nairobi",
      latitude: "200",
    });
    expect(result.success).toBe(false);
  });

  it("defaults county to Nairobi when omitted", () => {
    const result = propertyFormSchema.safeParse({ propertyType: "commercial", addressLine: "1 Kenyatta Ave" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.county).toBe("Nairobi");
  });
});

describe("serviceAddressFormSchema", () => {
  it("accepts a minimal valid service address", () => {
    expect(serviceAddressFormSchema.safeParse({ label: "Front gate" }).success).toBe(true);
  });

  it("rejects a missing label", () => {
    expect(serviceAddressFormSchema.safeParse({ label: "" }).success).toBe(false);
  });
});

describe("customerContactFormSchema", () => {
  // Migration 013 (customer_phone_requirements) requires every customer to
  // have both a primary and a secondary phone contact - phonePrimary/
  // phoneSecondary are required fields here to match, not optional.
  const validPhones = { phonePrimary: "0712345678", phoneSecondary: "0798765432" };

  it("accepts a minimal valid contact with both required phones", () => {
    expect(
      customerContactFormSchema.safeParse({ fullName: "John Doe", ...validPhones }).success,
    ).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(customerContactFormSchema.safeParse({ fullName: "", ...validPhones }).success).toBe(false);
  });

  it("rejects a missing primary phone", () => {
    expect(
      customerContactFormSchema.safeParse({ fullName: "John", phoneSecondary: "0798765432" }).success,
    ).toBe(false);
  });

  it("rejects a missing secondary phone", () => {
    expect(
      customerContactFormSchema.safeParse({ fullName: "John", phonePrimary: "0712345678" }).success,
    ).toBe(false);
  });

  it("defaults receivesInvoices to false", () => {
    const result = customerContactFormSchema.safeParse({ fullName: "John", ...validPhones });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.receivesInvoices).toBe(false);
  });
});
