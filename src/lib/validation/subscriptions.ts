import { z } from "zod";
import { nonEmptyString } from "@/lib/validation/common";

export const contractBillingTermsSchema = z.enum(["prepaid", "net_15", "net_30"]);

export const contractFormSchema = z.object({
  billingTerms: contractBillingTermsSchema,
  startDate: nonEmptyString("Start date"),
});

export type ContractFormValues = z.infer<typeof contractFormSchema>;

export const planFrequencySchema = z.enum(["weekly", "biweekly", "monthly", "on_demand"]);

export const subscriptionFormSchema = z.object({
  contractId: z.string().uuid("Select a contract"),
  serviceAddressId: z.string().uuid("Select a service address"),
  servicePlanId: z.string().uuid("Select a service plan"),
  frequency: planFrequencySchema,
  startDate: nonEmptyString("Start date"),
});

export type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;

export const subscriptionStatusSchema = z.enum(["pending", "active", "paused", "cancelled"]);
