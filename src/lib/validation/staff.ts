import { z } from "zod";
import { ASSIGNABLE_STAFF_ROLES } from "@/types/roles";
import { emailSchema, kenyanPhoneSchema } from "@/lib/validation/common";

export const MIN_PASSWORD_LENGTH = 12;

export const staffRoleSchema = z.enum(ASSIGNABLE_STAFF_ROLES);

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(72, "Password is too long (max 72 characters)");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Too long (max ${max} characters)`)
    .optional()
    .transform((v) => (v ? v : undefined));

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

/** Licence fields are only needed for drivers; checked in refineDriver. */
const driverFields = {
  licenseNumber: optionalText(50),
  licenseExpiry: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(isoDay.optional()),
};

function refineDriver<T extends { role: string; licenseNumber?: string; licenseExpiry?: string }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  if (v.role === "driver") {
    if (!v.licenseNumber) ctx.addIssue({ code: "custom", path: ["licenseNumber"], message: "Licence number is required for a driver" });
    if (!v.licenseExpiry) ctx.addIssue({ code: "custom", path: ["licenseExpiry"], message: "Licence expiry is required for a driver" });
  }
}

export const createStaffSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name is required").max(120, "Name is too long"),
    email: emailSchema.transform((v) => v.toLowerCase()),
    phone: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(kenyanPhoneSchema.optional()),
    role: staffRoleSchema,
    department: optionalText(80),
    employeeNumber: optionalText(30),
    password: passwordSchema,
    ...driverFields,
  })
  .superRefine(refineDriver);

export const changeRoleSchema = z
  .object({
    userId: z.string().uuid(),
    role: staffRoleSchema,
    ...driverFields,
  })
  .superRefine((v, ctx) => {
    // For an existing driver who is returning to the driver role, the DB
    // already holds the licence, so only a first-time driver needs it.
    // The database makes the final call; this is a friendly early check
    // only when both fields are partially filled.
    if (v.role === "driver" && (v.licenseNumber ? !v.licenseExpiry : !!v.licenseExpiry)) {
      ctx.addIssue({ code: "custom", path: ["licenseNumber"], message: "Enter both the licence number and its expiry" });
    }
  });

export const staffStatusSchema = z.object({
  userId: z.string().uuid(),
  intent: z.enum(["suspend", "reactivate"]),
});

export const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: passwordSchema,
});

export const changeOwnPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords do not match" });
