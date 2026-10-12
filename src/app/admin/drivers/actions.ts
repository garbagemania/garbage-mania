"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";
import { friendlyError } from "@/lib/friendly-error";
import { driverFormSchema } from "@/lib/validation/fleet";

// Same roles the database's drivers write policy allows (011_rls_policies.sql).
const CAN_MANAGE = ["super_admin", "operations_manager"] as const;

function go(path: string, kind: "error" | "saved", message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`);
}

/** Updates a driver's licence details and status. (Creating a driver is done through Staff, which also creates the login.) */
export async function updateDriver(formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const id = String(formData.get("id") ?? "");
  const here = `/admin/drivers/${id}`;
  const parsed = driverFormSchema.safeParse({
    id,
    licenseNumber: formData.get("licenseNumber"),
    licenseExpiry: formData.get("licenseExpiry"),
    status: formData.get("status"),
  });
  if (!parsed.success) go(/^[0-9a-f-]{36}$/i.test(id) ? here : "/admin/drivers", "error", parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("drivers")
    .update({ license_number: v.licenseNumber, license_expiry: v.licenseExpiry, status: v.status })
    .eq("id", v.id);
  if (error) {
    const duplicate = /duplicate key|already exists|drivers_license_number/i.test(error.message);
    go(here, "error", duplicate ? "Another driver already has that licence number." : friendlyError(error.message));
  }

  revalidatePath("/admin/drivers");
  go("/admin/drivers", "saved", "Driver updated.");
}
