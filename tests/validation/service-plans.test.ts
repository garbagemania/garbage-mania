import { describe, expect, it } from "vitest";
import { servicePlanFormSchema, servicePlanPriceFormSchema } from "@/lib/validation/service-plans";

describe("servicePlanFormSchema", () => {
  it("accepts a valid plan", () => {
    const result = servicePlanFormSchema.safeParse({
      code: "RES-WEEKLY-240L",
      name: "Weekly residential",
      wasteType: "general",
      defaultFrequency: "weekly",
      priceKes: 2500,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing code", () => {
    const result = servicePlanFormSchema.safeParse({
      code: "",
      name: "Weekly residential",
      wasteType: "general",
      defaultFrequency: "weekly",
      priceKes: 2500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = servicePlanFormSchema.safeParse({
      code: "X",
      name: "X",
      wasteType: "general",
      defaultFrequency: "weekly",
      priceKes: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid waste type", () => {
    const result = servicePlanFormSchema.safeParse({
      code: "X",
      name: "X",
      wasteType: "toxic_sludge",
      defaultFrequency: "weekly",
      priceKes: 100,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a zero price (e.g. a free/promotional plan)", () => {
    const result = servicePlanFormSchema.safeParse({
      code: "X",
      name: "X",
      wasteType: "general",
      defaultFrequency: "weekly",
      priceKes: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("servicePlanPriceFormSchema", () => {
  it("accepts a valid new price", () => {
    expect(
      servicePlanPriceFormSchema.safeParse({ priceKes: 3000, effectiveFrom: "2026-01-01" }).success,
    ).toBe(true);
  });

  it("rejects a missing effective date", () => {
    expect(servicePlanPriceFormSchema.safeParse({ priceKes: 3000, effectiveFrom: "" }).success).toBe(false);
  });

  it("rejects a negative price", () => {
    expect(servicePlanPriceFormSchema.safeParse({ priceKes: -1, effectiveFrom: "2026-01-01" }).success).toBe(false);
  });
});
