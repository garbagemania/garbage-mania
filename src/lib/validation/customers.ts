import { z } from "zod";
import { emailSchema, kenyanPhoneSchema, nonEmptyString } from "@/lib/validation/common";

export const customerTypeSchema = z.enum(["individual", "corporate"]);
export const customerStatusSchema = z.enum(["active", "suspended", "closed"]);

export const customerFormSchema = z.object({
  customerType: customerTypeSchema,
  displayName: nonEmptyString("Name"),
  kraPin: z.string().trim().max(20).optional().or(z.literal("")),
  billingEmail: emailSchema.optional().or(z.literal("")),
  billingPhone: kenyanPhoneSchema.optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export const customerStatusFormSchema = z.object({
  status: customerStatusSchema,
});

export const propertyTypeSchema = z.enum([
  "residential",
  "commercial",
  "industrial",
  "institutional",
]);

export const propertyFormSchema = z.object({
  propertyType: propertyTypeSchema,
  name: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine: nonEmptyString("Address"),
  ward: z.string().trim().max(200).optional().or(z.literal("")),
  subCounty: z.string().trim().max(200).optional().or(z.literal("")),
  county: z.string().trim().min(1).max(200).default("Nairobi"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

export const serviceAddressFormSchema = z.object({
  label: nonEmptyString("Label"),
  accessNotes: z.string().trim().max(1000).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export type ServiceAddressFormValues = z.infer<typeof serviceAddressFormSchema>;


// CUSTOMER CONTACTS
// Phone 1 + Phone 2 required
// Phone 3 optional

export const customerContactFormSchema = z.object({
  fullName: nonEmptyString("Name"),

  title: z.string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal("")),

  email: emailSchema
    .optional()
    .or(z.literal("")),

  phonePrimary: kenyanPhoneSchema,

  phoneSecondary: kenyanPhoneSchema,

  phoneTertiary: kenyanPhoneSchema
    .optional()
    .or(z.literal("")),

  receivesInvoices: z.coerce.boolean().default(false),
});

export type CustomerContactFormValues = z.infer<
  typeof customerContactFormSchema
>;
