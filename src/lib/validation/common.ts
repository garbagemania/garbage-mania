import { z } from "zod";

/**
 * Shared validation primitives. Feature-specific schemas (customer, contract,
 * invoice, collection, etc.) will live alongside their feature once the
 * schema design phase begins, and should import and extend these rather than
 * redefining formats like phone numbers or money.
 */

/** Kenyan phone number, accepting 07xxxxxxxx, 01xxxxxxxx, or +2547xxxxxxxx. */
export const kenyanPhoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+254|0)(7|1)\d{8}$/,
    "Enter a valid Kenyan phone number, e.g. 0712345678 or +254712345678",
  );

export const emailSchema = z.string().trim().email("Enter a valid email address");

/** Monetary amount in KES — stored as an integer count of cents to avoid float rounding errors. */
export const moneyCentsSchema = z
  .number()
  .int("Amount must be a whole number of cents")
  .nonnegative("Amount cannot be negative");

export const nonEmptyString = (label: string) =>
  z.string().trim().min(1, `${label} is required`);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;
