import { z } from "zod";
import { emailSchema, kenyanPhoneSchema, nonEmptyString } from "./common";

/** The "Subscription" tick-list on the paper Client On-Boarding Form (Form A1), in form order. */
export const SIGNUP_SERVICES = [
  "Bio-Degradable / Organic",
  "Carpet Cleaning",
  "Cleaning Services",
  "Detailed Car Cleaning",
  "Exhauster Services",
  "Fumigation & Pest Control",
  "Garbage Collection",
  "Hazardous Waste Management",
  "Landscaping & Gardening",
  "Movers",
  "Plastics",
  "Sanitary Bin Services",
  "Washroom Solutions",
  "Waste Management",
] as const;

/** value 0 = Sunday ... 6 = Saturday, matching collection_schedules.day_of_week. */
export const SERVICE_DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
] as const;

export const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "yearly", label: "Yearly" },
] as const;

export function dayLabel(value: number): string {
  return SERVICE_DAYS.find((d) => d.value === value)?.label ?? String(value);
}

export function billingCycleLabel(value: string | null | undefined): string {
  return BILLING_CYCLES.find((c) => c.value === value)?.label ?? "—";
}

const optionalText = (max: number) => z.string().trim().max(max, `Too long (max ${max} characters)`).optional().or(z.literal(""));

export const customerSignupSchema = z
  .object({
    customerType: z.enum(["individual", "corporate"], { errorMap: () => ({ message: "Choose Corporate or Individual" }) }),
    name: nonEmptyString("Name").pipe(z.string().max(200, "Name is too long")),
    email: emailSchema,
    password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long"),
    confirmPassword: z.string(),
    phonePrimary: kenyanPhoneSchema,
    phoneSecondary: kenyanPhoneSchema,
    county: nonEmptyString("County").pipe(z.string().max(100)),
    ward: nonEmptyString("Ward").pipe(z.string().max(200)),
    region: optionalText(200),
    streetName: optionalText(200),
    houseNumber: optionalText(200),
    addressDescription: optionalText(500),
    services: z
      .array(z.enum(SIGNUP_SERVICES))
      .min(1, "Tick at least one service you want to subscribe to")
      .max(SIGNUP_SERVICES.length),
    serviceDays: z.array(z.number().int().min(0).max(6)).max(7),
    billingCycle: z.enum(["monthly", "quarterly", "half_yearly", "yearly"], {
      errorMap: () => ({ message: "Choose a billing cycle" }),
    }),
    caretakerName: optionalText(200),
    caretakerPhone: kenyanPhoneSchema.optional().or(z.literal("")),
    caretakerEmail: emailSchema.optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match" });
    }
    if (normalizePhone(v.phonePrimary) === normalizePhone(v.phoneSecondary)) {
      ctx.addIssue({ code: "custom", path: ["phoneSecondary"], message: "Secondary phone must be different from the primary phone" });
    }
    if (!v.streetName && !v.houseNumber) {
      ctx.addIssue({
        code: "custom",
        path: ["streetName"],
        message: "Enter a street/road or a house / gate / apartment number",
      });
    }
  });

export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;

/** 07xx / 01xx / +254… -> comparable 254… form. */
export function normalizePhone(phone: string): string {
  const p = phone.trim().replace(/\s+/g, "");
  if (p.startsWith("+254")) return p.slice(1);
  if (p.startsWith("0")) return `254${p.slice(1)}`;
  return p;
}

/** Raw FormData -> plain object for the schema. Multi-value fields use getAll(). */
export function readSignupForm(formData: FormData) {
  const text = (key: string) => String(formData.get(key) ?? "");
  return {
    customerType: text("customerType"),
    name: text("name"),
    email: text("email"),
    password: text("password"),
    confirmPassword: text("confirmPassword"),
    phonePrimary: text("phonePrimary"),
    phoneSecondary: text("phoneSecondary"),
    county: text("county"),
    ward: text("ward"),
    region: text("region"),
    streetName: text("streetName"),
    houseNumber: text("houseNumber"),
    addressDescription: text("addressDescription"),
    services: formData.getAll("services").map(String),
    serviceDays: formData.getAll("serviceDays").map((v) => Number(v)),
    billingCycle: text("billingCycle"),
    caretakerName: text("caretakerName"),
    caretakerPhone: text("caretakerPhone"),
    caretakerEmail: text("caretakerEmail"),
  };
}
