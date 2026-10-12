"use server";

import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { kenyanPhoneSchema, nonEmptyString } from "@/lib/validation/common";

const onboardingSchema = z.object({
  customerType: z.enum(["individual", "corporate"]),
  displayName: nonEmptyString("Name"),
  kraPin: z.string().trim().max(20).optional().or(z.literal("")),
  phone1: kenyanPhoneSchema,
  phone2: kenyanPhoneSchema,
  phone3: kenyanPhoneSchema.optional().or(z.literal("")),
  county: nonEmptyString("County"),
  subCounty: z.string().trim().max(200).optional().or(z.literal("")),
  ward: z.string().trim().max(200).optional().or(z.literal("")),
  address: nonEmptyString("Address"),
});

function fail(message: string): never {
  redirect(`/portal/onboarding?error=${encodeURIComponent(friendlyError(message))}`);
}

/**
 * Customer self-service onboarding. Runs as the signed-in customer's own
 * authenticated client, so every write is bound by the customer-scoped
 * RLS policies in 016_customer_self_service.sql. Every write's error is
 * checked - an earlier version ignored them and redirected to /portal as
 * if onboarding had succeeded even when RLS or a constraint rejected it.
 */
export async function completeOnboarding(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = onboardingSchema.safeParse({
    customerType: formData.get("customerType"),
    displayName: formData.get("displayName"),
    kraPin: formData.get("kraPin") ?? "",
    phone1: formData.get("phone1"),
    phone2: formData.get("phone2"),
    phone3: formData.get("phone3") ?? "",
    county: formData.get("county"),
    subCounty: formData.get("subCounty") ?? "",
    ward: formData.get("ward") ?? "",
    address: formData.get("address"),
  });

  if (!parsed.success) {
    fail(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
  }

  const v = parsed.data;
  const supabase = createSupabaseServerClient();

  // customer_profiles.id IS the auth user's id (PK and FK to profiles.id).
  const { data: customerProfile } = await supabase
    .from("customer_profiles")
    .select("customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!customerProfile) redirect("/not-authorized");
  const customerId = customerProfile.customer_id;

  // Idempotency: never create a second property/address/contact set for a
  // customer who already has one (page revisit, double submit, or a retry
  // after a partial failure). Each part is only written if it is missing.
  const [existingProperty, existingContact] = await Promise.all([
    supabase.from("properties").select("id").eq("customer_id", customerId).limit(1),
    supabase.from("customer_contacts").select("id").eq("customer_id", customerId).limit(1),
  ]);
  if (existingProperty.error) fail(existingProperty.error.message);
  if (existingContact.error) fail(existingContact.error.message);

  const hasProperty = (existingProperty.data ?? []).length > 0;
  const hasContacts = (existingContact.data ?? []).length > 0;
  if (hasProperty && hasContacts) redirect("/portal");

  const { error: customerError } = await supabase
    .from("customers")
    .update({
      customer_type: v.customerType,
      display_name: v.displayName,
      kra_pin: v.kraPin || null,
      billing_phone: v.phone1,
    })
    .eq("id", customerId);
  if (customerError) fail(customerError.message);

  if (!hasProperty) {
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .insert({
        customer_id: customerId,
        property_type: "residential",
        name: v.displayName,
        address_line: v.address,
        ward: v.ward || null,
        sub_county: v.subCounty || null,
        county: v.county,
      })
      .select("id")
      .single();
    if (propertyError || !property) fail(propertyError?.message ?? "Could not save your address.");

    // customer_id is derived from property_id by the sync trigger
    // (002_customers.sql); it is intentionally not sent here.
    const { error: addressError } = await supabase.from("service_addresses").insert({
      property_id: property.id,
      // Overwritten by sync_service_address_customer (002_customers.sql).
      customer_id: customerId,
      label: "Main collection address",
      status: "active",
    });
    if (addressError) fail(addressError.message);
  }

  if (!hasContacts) {
    // All phone rows in ONE insert so migration 013's deferred
    // primary+secondary requirement is checked against the full set.
    const contactBase = { customer_id: customerId, full_name: v.displayName };
    const { error: contactError } = await supabase.from("customer_contacts").insert([
      { ...contactBase, phone: v.phone1, receives_invoices: true, contact_phone_type: "primary" },
      { ...contactBase, phone: v.phone2, receives_invoices: false, contact_phone_type: "secondary" },
      ...(v.phone3
        ? [{ ...contactBase, phone: v.phone3, receives_invoices: false, contact_phone_type: "tertiary" }]
        : []),
    ]);
    if (contactError) fail(contactError.message);
  }

  redirect("/portal");
}
