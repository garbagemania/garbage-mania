import { describe, expect, it } from "vitest";
import { contractFormSchema, subscriptionFormSchema } from "@/lib/validation/subscriptions";

const validUuid = "11111111-1111-1111-1111-111111111111";

describe("contractFormSchema", () => {
  it("accepts valid billing terms and start date", () => {
    expect(contractFormSchema.safeParse({ billingTerms: "net_30", startDate: "2026-01-01" }).success).toBe(true);
  });

  it("rejects an invalid billing term", () => {
    expect(contractFormSchema.safeParse({ billingTerms: "net_60", startDate: "2026-01-01" }).success).toBe(false);
  });

  it("rejects a missing start date", () => {
    expect(contractFormSchema.safeParse({ billingTerms: "net_30", startDate: "" }).success).toBe(false);
  });
});

describe("subscriptionFormSchema", () => {
  it("accepts a fully valid subscription", () => {
    const result = subscriptionFormSchema.safeParse({
      contractId: validUuid,
      serviceAddressId: validUuid,
      servicePlanId: validUuid,
      frequency: "weekly",
      startDate: "2026-01-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID contractId", () => {
    const result = subscriptionFormSchema.safeParse({
      contractId: "not-a-uuid",
      serviceAddressId: validUuid,
      servicePlanId: validUuid,
      frequency: "weekly",
      startDate: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid frequency", () => {
    const result = subscriptionFormSchema.safeParse({
      contractId: validUuid,
      serviceAddressId: validUuid,
      servicePlanId: validUuid,
      frequency: "daily",
      startDate: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });
});
