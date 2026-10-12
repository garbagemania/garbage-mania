"use server";

import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPortalContext } from "@/lib/portal/customer";
import { nonEmptyString } from "@/lib/validation/common";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const addressSchema = z.object({
  label: nonEmptyString("Address label").pipe(z.string().max(120)),
  propertyType: z.enum(["residential", "commercial", "industrial", "institutional"]),
  county: nonEmptyString("County"),
  subCounty: optionalText(200),
  ward: optionalText(200),
  addressLine: nonEmptyString("Physical address").pipe(z.string().max(500)),
  accessNotes: optionalText(1000),
});

const editSchema = addressSchema.omit({ label: true, accessNotes: true });

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(friendlyError(message))}`);
}

function fields(formData: FormData) {
  return {
    label: formData.get("label"),
    propertyType: formData.get("propertyType"),
    county: formData.get("county"),
    subCounty: String(formData.get("subCounty") ?? ""),
    ward: String(formData.get("ward") ?? ""),
    addressLine: formData.get("addressLine"),
    accessNotes: String(formData.get("accessNotes") ?? ""),
  };
}

/**
 * Adds a property + its service address for the signed-in customer. Both
 * inserts run as the customer and are authorised by properties_insert_own
 * and service_addresses_insert_own (016_customer_self_service.sql); the
 * customer_id is taken from the session, never from the form.
 */
export async function addAddress(formData: FormData) {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) fail("/portal/addresses/new", "This login is not linked to a customer account.");

  const parsed = addressSchema.safeParse(fields(formData));
  if (!parsed.success) fail("/portal/addresses/new", parsed.error.issues[0]?.message ?? "Please check the form.");
  const v = parsed.data;

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .insert({
      customer_id: customerId,
      property_type: v.propertyType,
      name: v.label,
      address_line: v.addressLine,
      ward: v.ward || null,
      sub_county: v.subCounty || null,
      county: v.county,
    })
    .select("id")
    .single();
  if (propertyError || !property) fail("/portal/addresses/new", propertyError?.message ?? "Could not save the address.");

  const { error: addressError } = await supabase.from("service_addresses").insert({
    property_id: property.id,
    // Overwritten by sync_service_address_customer (002_customers.sql).
    customer_id: customerId,
    label: v.label,
    access_notes: v.accessNotes || null,
    status: "active",
  });

  if (addressError) {
    // Customers cannot delete rows; mark the orphan property inactive so it is not left looking live.
    await supabase.from("properties").update({ status: "inactive" }).eq("id", property.id);
    fail("/portal/addresses/new", addressError.message);
  }

  revalidatePath("/portal/addresses");
  redirect("/portal/addresses?saved=added");
}

/**
 * Edits the property details behind a service address. service_addresses
 * has no customer UPDATE policy (staff only), so label/access notes are not
 * editable here - only the property fields properties_update_own permits.
 */
export async function updateAddress(formData: FormData) {
  const { supabase, customerId } = await getPortalContext();
  const propertyId = z.string().uuid().safeParse(formData.get("propertyId"));
  const serviceAddressId = String(formData.get("serviceAddressId") ?? "");
  const back = `/portal/addresses/${encodeURIComponent(serviceAddressId)}`;

  if (!customerId || !propertyId.success) fail("/portal/addresses", "Could not update that address.");

  const parsed = editSchema.safeParse(fields(formData));
  if (!parsed.success) fail(back, parsed.error.issues[0]?.message ?? "Please check the form.");
  const v = parsed.data;

  const { data, error } = await supabase
    .from("properties")
    .update({
      property_type: v.propertyType,
      address_line: v.addressLine,
      ward: v.ward || null,
      sub_county: v.subCounty || null,
      county: v.county,
    })
    .eq("id", propertyId.data)
    .eq("customer_id", customerId)
    .select("id");

  if (error) fail(back, error.message);
  if (!data || data.length === 0) fail(back, "Your changes could not be saved.");

  revalidatePath("/portal/addresses");
  redirect("/portal/addresses?saved=updated");
}
