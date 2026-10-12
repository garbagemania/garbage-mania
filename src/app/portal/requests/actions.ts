"use server";

import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPortalContext } from "@/lib/portal/customer";
import { todayNairobi } from "@/lib/portal/dates";

const requestSchema = z.object({
  serviceAddressId: z.string().uuid("Choose a service address"),
  wasteType: z.enum(["general", "recyclable", "organic", "hazardous", "bulky"]),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  notes: z.string().trim().max(1000, "Notes are too long").optional().or(z.literal("")),
});

function fail(message: string): never {
  redirect(`/portal/requests?error=${encodeURIComponent(friendlyError(message))}`);
}

/**
 * Submits a collection request for the signed-in customer. customer_id comes
 * from the session. The chosen address is re-read through the customer's own
 * RLS-scoped client first: waste_collection_requests_insert_own only checks
 * customer_id, not that the address is theirs, so the ownership check for
 * the address has to happen here (see PORTAL_CUSTOMER_REVIEW.md).
 */
export async function submitRequest(formData: FormData) {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) fail("This login is not linked to a customer account.");

  const parsed = requestSchema.safeParse({
    serviceAddressId: formData.get("serviceAddressId"),
    wasteType: formData.get("wasteType"),
    requestedDate: formData.get("requestedDate"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const v = parsed.data;

  if (v.requestedDate < todayNairobi()) fail("The requested date can't be in the past.");

  const { data: address, error: addressError } = await supabase
    .from("service_addresses")
    .select("id, status")
    .eq("id", v.serviceAddressId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (addressError) fail(addressError.message);
  if (!address) fail("That service address wasn't found on your account.");
  if (address.status !== "active") fail("That service address is inactive.");

  const { error } = await supabase.from("waste_collection_requests").insert({
    customer_id: customerId,
    service_address_id: address.id,
    waste_type: v.wasteType,
    requested_date: v.requestedDate,
    notes: v.notes || null,
  });
  if (error) fail(error.message);

  revalidatePath("/portal/requests");
  redirect("/portal/requests?saved=1");
}

/** Withdraws one of the customer's own requests while it is still awaiting review (rules live in the database). */
export async function cancelRequest(formData: FormData) {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) fail("This login is not linked to a customer account.");

  const id = z.string().uuid().safeParse(formData.get("requestId"));
  if (!id.success) fail("That request could not be found.");

  // The cast is needed until `npm run db:types` is rerun after migration 025.
  const { error } = await (supabase as unknown as { rpc: (fn: string, args: object) => Promise<{ error: { message: string } | null }> }).rpc(
    "cancel_own_collection_request",
    { p_request_id: id.data },
  );
  if (error) fail(error.message);

  revalidatePath("/portal/requests");
  redirect(`/portal/requests?saved=${encodeURIComponent("Request cancelled.")}`);
}
