"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";
import { friendlyError } from "@/lib/friendly-error";
import { vehicleFormSchema } from "@/lib/validation/fleet";

// Same roles the database's vehicles_insert / vehicles_update policies allow.
const CAN_MANAGE = ["super_admin", "operations_manager"] as const;

function go(path: string, kind: "error" | "saved", message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`);
}

function readForm(formData: FormData) {
  return vehicleFormSchema.safeParse({
    registrationNumber: formData.get("registrationNumber"),
    vehicleType: String(formData.get("vehicleType") ?? ""),
    capacityKg: formData.get("capacityKg") ?? "",
    status: formData.get("status") ?? "active",
  });
}

export async function createVehicle(formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const parsed = readForm(formData);
  if (!parsed.success) go("/admin/vehicles/new", "error", parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      registration_number: v.registrationNumber,
      vehicle_type: v.vehicleType || null,
      capacity_kg: v.capacityKg ?? null,
      status: v.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    const duplicate = /duplicate key|already exists/i.test(error?.message ?? "");
    go("/admin/vehicles/new", "error", duplicate ? "A vehicle with that registration number already exists." : friendlyError(error?.message));
  }

  revalidatePath("/admin/vehicles");
  go("/admin/vehicles", "saved", `Vehicle ${v.registrationNumber} added.`);
}

export async function updateVehicle(formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const id = String(formData.get("id") ?? "");
  const here = `/admin/vehicles/${id}`;
  if (!/^[0-9a-f-]{36}$/i.test(id)) go("/admin/vehicles", "error", "That vehicle could not be found.");

  const parsed = readForm(formData);
  if (!parsed.success) go(here, "error", parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("vehicles")
    .update({
      registration_number: v.registrationNumber,
      vehicle_type: v.vehicleType || null,
      capacity_kg: v.capacityKg ?? null,
      status: v.status,
    })
    .eq("id", id);

  if (error) {
    const duplicate = /duplicate key|already exists/i.test(error.message);
    go(here, "error", duplicate ? "Another vehicle already has that registration number." : friendlyError(error.message));
  }

  revalidatePath("/admin/vehicles");
  go(here, "saved", "Vehicle updated.");
}
