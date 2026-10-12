"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";
import {
  customerFormSchema,
  propertyFormSchema,
  serviceAddressFormSchema,
  customerContactFormSchema,
} from "@/lib/validation/customers";

function toOptional(value: FormDataEntryValue | null): string | undefined {
  const s = String(value ?? "").trim();
  return s === "" ? undefined : s;
}

/**
 * Every mutation here re-checks role server-side with requireStaffRole()
 * BEFORE attempting the write — this mirrors, but does not replace, the
 * real enforcement: the customers/properties/service_addresses/
 * customer_contacts INSERT/UPDATE policies in
 * supabase/migrations/011_rls_policies.sql. If these two ever
 * disagreed, RLS wins and the write fails regardless of what this
 * function decided — the requireStaffRole() calls exist to fail fast
 * with a clear error rather than relying on that as the only signal.
 */

export async function createCustomer(formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin", "admin"]);

  const parsed = customerFormSchema.safeParse({
    customerType: formData.get("customerType"),
    displayName: formData.get("displayName"),
    kraPin: formData.get("kraPin") ?? undefined,
    billingEmail: formData.get("billingEmail") ?? undefined,
    billingPhone: formData.get("billingPhone") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/customers/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      customer_type: values.customerType,
      display_name: values.displayName,
      kra_pin: values.kraPin || null,
      billing_email: values.billingEmail || null,
      billing_phone: values.billingPhone || null,
      notes: values.notes || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/admin/customers/new?error=${encodeURIComponent(error?.message ?? "Could not create customer")}`);
  }

  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${data.id}`);
}

export async function updateCustomer(customerId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin", "admin"]);

  const parsed = customerFormSchema.safeParse({
    customerType: formData.get("customerType"),
    displayName: formData.get("displayName"),
    kraPin: formData.get("kraPin") ?? undefined,
    billingEmail: formData.get("billingEmail") ?? undefined,
    billingPhone: formData.get("billingPhone") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    redirect(
      `/admin/customers/${customerId}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("customers")
    .update({
      customer_type: values.customerType,
      display_name: values.displayName,
      kra_pin: values.kraPin || null,
      billing_email: values.billingEmail || null,
      billing_phone: values.billingPhone || null,
      notes: values.notes || null,
    })
    .eq("id", customerId);

  if (error) {
    redirect(`/admin/customers/${customerId}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${customerId}`);
}

export async function updateCustomerStatus(customerId: string, status: "active" | "suspended" | "closed") {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin", "admin"]);

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("customers").update({ status }).eq("id", customerId);

  if (error) {
    redirect(`/admin/customers/${customerId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  redirect(`/admin/customers/${customerId}`);
}

export async function createProperty(customerId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin", "admin", "operations_manager"]);

  const parsed = propertyFormSchema.safeParse({
    propertyType: formData.get("propertyType"),
    name: toOptional(formData.get("name")),
    addressLine: formData.get("addressLine"),
    ward: formData.get("ward") ?? undefined,
    subCounty: formData.get("subCounty") ?? undefined,
    county: formData.get("county") || "Nairobi",
    latitude: toOptional(formData.get("latitude")),
    longitude: toOptional(formData.get("longitude")),
  });

  if (!parsed.success) {
    redirect(
      `/admin/customers/${customerId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid property")}`,
    );
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("properties").insert({
    customer_id: customerId,
    property_type: values.propertyType,
    name: values.name || null,
    address_line: values.addressLine,
    ward: values.ward || null,
    sub_county: values.subCounty || null,
    county: values.county,
    latitude: values.latitude ?? null,
    longitude: values.longitude ?? null,
  });

  if (error) {
    redirect(`/admin/customers/${customerId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/customers/${customerId}`);
  redirect(`/admin/customers/${customerId}`);
}

export async function createServiceAddress(customerId: string, propertyId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin", "admin", "operations_manager"]);

  const parsed = serviceAddressFormSchema.safeParse({
    label: formData.get("label"),
    accessNotes: formData.get("accessNotes"),
    latitude: toOptional(formData.get("latitude")),
    longitude: toOptional(formData.get("longitude")),
  });

  if (!parsed.success) {
    redirect(
      `/admin/customers/${customerId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid service address")}`,
    );
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();
  // customer_id is deliberately NOT sent here - service_addresses has a
  // BEFORE INSERT trigger (sync_service_address_customer, 002_customers.sql)
  // that derives it from property_id and overrides whatever is supplied.
  const { error } = await supabase.from("service_addresses").insert({
    property_id: propertyId,
    // Overwritten by sync_service_address_customer (002_customers.sql) -
    // included only to satisfy the generated Insert type's NOT NULL
    // customer_id column; the trigger is the actual source of truth.
    customer_id: customerId,
    label: values.label,
    access_notes: values.accessNotes || null,
    latitude: values.latitude ?? null,
    longitude: values.longitude ?? null,
  });

  if (error) {
    redirect(`/admin/customers/${customerId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/customers/${customerId}`);
  redirect(`/admin/customers/${customerId}`);
}

export async function createCustomerContact(customerId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin", "admin"]);

  const parsed = customerContactFormSchema.safeParse({
    fullName: formData.get("fullName"),
    title: formData.get("title"),
    email: formData.get("email"),
    phonePrimary: formData.get("phonePrimary"),
    phoneSecondary: formData.get("phoneSecondary"),
    phoneTertiary: formData.get("phoneTertiary") ?? "",
    receivesInvoices: formData.get("receivesInvoices") === "on",
  });

  if (!parsed.success) {
    redirect(
      `/admin/customers/${customerId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid contact")}`,
    );
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();

  // Migration 013 models each phone number as its own customer_contacts
  // row tagged with contact_phone_type (primary/secondary/tertiary), with a
  // unique (customer_id, contact_phone_type) index and a deferred
  // constraint requiring both primary and secondary. All rows go in ONE
  // insert so the deferred check sees them together. If this customer
  // already has a primary/secondary contact (e.g. from portal
  // onboarding), the unique index rejects the insert and the database's
  // error is shown as-is rather than guessed at.
  const base = {
    customer_id: customerId,
    full_name: values.fullName,
    title: values.title || null,
    email: values.email || null,
  };

  const rows = [
    { ...base, phone: values.phonePrimary, receives_invoices: values.receivesInvoices, contact_phone_type: "primary" },
    { ...base, phone: values.phoneSecondary, receives_invoices: false, contact_phone_type: "secondary" },
    ...(values.phoneTertiary
      ? [{ ...base, phone: values.phoneTertiary, receives_invoices: false, contact_phone_type: "tertiary" }]
      : []),
  ];

  const { error } = await supabase.from("customer_contacts").insert(rows);

  if (error) {
    redirect(`/admin/customers/${customerId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/customers/${customerId}`);
  redirect(`/admin/customers/${customerId}`);
}
