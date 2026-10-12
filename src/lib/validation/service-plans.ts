import { z } from "zod";
import { nonEmptyString } from "@/lib/validation/common";

export const wasteTypeSchema = z.enum(["general", "recyclable", "organic", "hazardous", "bulky"]);
export const planFrequencySchema = z.enum(["weekly", "biweekly", "monthly", "on_demand"]);

export const servicePlanFormSchema = z.object({
  code: nonEmptyString("Code"),
  name: nonEmptyString("Name"),
  wasteType: wasteTypeSchema,
  containerType: z.string().trim().max(100).optional().or(z.literal("")),
  defaultFrequency: planFrequencySchema,
  priceKes: z.coerce.number().nonnegative("Price cannot be negative"),
});

export type ServicePlanFormValues = z.infer<typeof servicePlanFormSchema>;

export const servicePlanPriceFormSchema = z.object({
  priceKes: z.coerce.number().nonnegative("Price cannot be negative"),
  effectiveFrom: z.string().trim().min(1, "Effective date is required"),
});

export type ServicePlanPriceFormValues = z.infer<typeof servicePlanPriceFormSchema>;
