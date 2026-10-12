"use server";

import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPortalContext } from "@/lib/portal/customer";
import { emailSchema, kenyanPhoneSchema, nonEmptyString } from "@/lib/validation/common";

const accountSchema = z.object({
  displayName: nonEmptyString("Name").pipe(z.string().max(200, "Name is too long")),
  billingEmail: emailSchema.optional().or(z.literal("")),
  billingPhone: kenyanPhoneSchema,
});

function fail(message: string): never {
  redirect(`/portal/account?error=${encodeURIComponent(friendlyError(message))}`);
}

/**
 * Updates ONLY display_name, billing_email and billing_phone on the
 * caller's own customer row. Status, KRA PIN and notes are deliberately not
 * touched here. The write runs as the signed-in customer, so
 * customers_update_own (016_customer_self_service.sql) is what authorises
 * it; `.select("id")` lets us detect an RLS-filtered update that matched no
 * row instead of reporting a false success.
 */
export async function updateAccount(formData: FormData) {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) fail("This login is not linked to a customer account.");

  const parsed = accountSchema.safeParse({
    displayName: formData.get("displayName"),
    billingEmail: String(formData.get("billingEmail") ?? ""),
    billingPhone: formData.get("billingPhone"),
  });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Please check the form and try again.");

  const v = parsed.data;
  const { data, error } = await supabase
    .from("customers")
    .update({
      display_name: v.displayName,
      billing_email: v.billingEmail || null,
      billing_phone: v.billingPhone,
    })
    .eq("id", customerId)
    .select("id");

  if (error) fail(error.message);
  if (!data || data.length === 0) fail("Your changes could not be saved.");

  revalidatePath("/portal", "layout");
  redirect("/portal/account?saved=1");
}
