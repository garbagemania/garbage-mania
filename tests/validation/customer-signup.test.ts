import { describe, expect, it } from "vitest";
import { customerSignupSchema, readSignupForm, normalizePhone } from "@/lib/validation/customer-signup";

const valid = {
  customerType: "corporate",
  name: "Example Ltd",
  email: "info@example.co.ke",
  password: "longenough1",
  confirmPassword: "longenough1",
  phonePrimary: "0712345678",
  phoneSecondary: "+254722345678",
  county: "Nairobi",
  ward: "Upper Hill",
  region: "",
  streetName: "",
  houseNumber: "58/11/1591",
  addressDescription: "",
  services: ["Garbage Collection"],
  serviceDays: [1, 4],
  billingCycle: "monthly",
  caretakerName: "",
  caretakerPhone: "",
  caretakerEmail: "",
};

const issues = (input: unknown) => {
  const r = customerSignupSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("customerSignupSchema", () => {
  it("accepts a complete form (street OR house number is enough)", () => {
    expect(customerSignupSchema.safeParse(valid).success).toBe(true);
  });

  it("requires name, county and ward", () => {
    expect(issues({ ...valid, name: " " })).toContain("Name is required");
    expect(issues({ ...valid, county: "" })).toContain("County is required");
    expect(issues({ ...valid, ward: "" })).toContain("Ward is required");
  });

  it("requires both phone numbers, valid, and different", () => {
    expect(issues({ ...valid, phonePrimary: "123" }).length).toBeGreaterThan(0);
    expect(issues({ ...valid, phoneSecondary: "" }).length).toBeGreaterThan(0);
    expect(issues({ ...valid, phoneSecondary: "+254712345678" })).toContain(
      "Secondary phone must be different from the primary phone",
    );
  });

  it("needs a street/road or a house number", () => {
    expect(issues({ ...valid, houseNumber: "", streetName: "" })).toContain(
      "Enter a street/road or a house / gate / apartment number",
    );
    expect(customerSignupSchema.safeParse({ ...valid, houseNumber: "", streetName: "Argwings Kodhek Rd" }).success).toBe(true);
  });

  it("requires at least one known service and rejects unknown ones", () => {
    expect(issues({ ...valid, services: [] })).toContain("Tick at least one service you want to subscribe to");
    expect(issues({ ...valid, services: ["Free Money"] }).length).toBeGreaterThan(0);
  });

  it("limits service days to 0-6 and requires a billing cycle", () => {
    expect(issues({ ...valid, serviceDays: [7] }).length).toBeGreaterThan(0);
    expect(issues({ ...valid, billingCycle: "weekly" })).toContain("Choose a billing cycle");
  });

  it("checks the password length and confirmation", () => {
    expect(issues({ ...valid, password: "short", confirmPassword: "short" })).toContain(
      "Password must be at least 8 characters",
    );
    expect(issues({ ...valid, confirmPassword: "different1" })).toContain("Passwords do not match");
  });

  it("treats the caretaker as optional but validates it when given", () => {
    expect(customerSignupSchema.safeParse({ ...valid, caretakerName: "John" }).success).toBe(true);
    expect(issues({ ...valid, caretakerPhone: "abc" }).length).toBeGreaterThan(0);
    expect(issues({ ...valid, caretakerEmail: "nope" }).length).toBeGreaterThan(0);
  });

  it("rejects an invalid customer type", () => {
    expect(issues({ ...valid, customerType: "admin" })).toContain("Choose Corporate or Individual");
  });
});

describe("readSignupForm / normalizePhone", () => {
  it("reads repeated checkbox fields into arrays and numbers", () => {
    const fd = new FormData();
    fd.append("services", "Movers");
    fd.append("services", "Plastics");
    fd.append("serviceDays", "0");
    fd.append("serviceDays", "3");
    const r = readSignupForm(fd);
    expect(r.services).toEqual(["Movers", "Plastics"]);
    expect(r.serviceDays).toEqual([0, 3]);
  });

  it("normalises phone formats for comparison", () => {
    expect(normalizePhone("0712345678")).toBe("254712345678");
    expect(normalizePhone("+254712345678")).toBe("254712345678");
  });
});
