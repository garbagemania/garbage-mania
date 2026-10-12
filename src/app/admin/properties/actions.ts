"use server";

import { redirect } from "next/navigation";
import { createProperty } from "@/app/admin/customers/actions";

/** "Add property" from the Properties list: the customer is chosen on the form, then the existing, role-checked createProperty() does the work. */
export async function createPropertyFromList(formData: FormData) {
  const customerId = String(formData.get("customerId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) {
    redirect(`/admin/properties/new?error=${encodeURIComponent("Choose the customer this property belongs to.")}`);
  }
  return createProperty(customerId, formData);
}
