"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";
import { friendlyError } from "@/lib/friendly-error";
import { todayNairobi } from "@/lib/portal/dates";
import { routeFormSchema, routeStopFormSchema, scheduleRunFormSchema } from "@/lib/validation/fleet";

// Same roles the database's routes / route_stops / daily_assignments write policies allow.
const CAN_MANAGE = ["super_admin", "operations_manager"] as const;

function go(path: string, kind: "error" | "saved", message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}`);
}

async function guard() {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);
  return createSupabaseServerClient();
}

function readRoute(formData: FormData) {
  return routeFormSchema.safeParse({
    name: formData.get("name"),
    area: String(formData.get("area") ?? ""),
    defaultDriverId: formData.get("defaultDriverId") ?? "",
    defaultVehicleId: formData.get("defaultVehicleId") ?? "",
    status: formData.get("status") ?? "active",
  });
}

export async function createRoute(formData: FormData) {
  const supabase = await guard();
  const parsed = readRoute(formData);
  if (!parsed.success) go("/admin/routes/new", "error", parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;

  const { data, error } = await supabase
    .from("routes")
    .insert({
      name: v.name,
      area: v.area || null,
      default_driver_id: v.defaultDriverId ?? null,
      default_vehicle_id: v.defaultVehicleId ?? null,
      status: v.status,
    })
    .select("id")
    .single();
  if (error || !data) go("/admin/routes/new", "error", friendlyError(error?.message));

  revalidatePath("/admin/routes");
  go(`/admin/routes/${data.id}`, "saved", "Route created. Now add its stops below.");
}

export async function updateRoute(formData: FormData) {
  const supabase = await guard();
  const id = String(formData.get("id") ?? "");
  const here = `/admin/routes/${id}`;
  if (!/^[0-9a-f-]{36}$/i.test(id)) go("/admin/routes", "error", "That route could not be found.");

  const parsed = readRoute(formData);
  if (!parsed.success) go(here, "error", parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;

  const { error } = await supabase
    .from("routes")
    .update({
      name: v.name,
      area: v.area || null,
      default_driver_id: v.defaultDriverId ?? null,
      default_vehicle_id: v.defaultVehicleId ?? null,
      status: v.status,
    })
    .eq("id", id);
  if (error) go(here, "error", friendlyError(error.message));

  revalidatePath("/admin/routes");
  go(here, "saved", "Route updated.");
}

export async function addRouteStop(formData: FormData) {
  const supabase = await guard();
  const parsed = routeStopFormSchema.safeParse({
    routeId: formData.get("routeId"),
    serviceAddressId: formData.get("serviceAddressId"),
  });
  const routeId = String(formData.get("routeId") ?? "");
  const here = `/admin/routes/${routeId}`;
  if (!parsed.success) go(here, "error", parsed.error.issues[0]?.message ?? "Choose an address to add.");
  const v = parsed.data;

  // Stops are numbered in the order they are added; the database also guarantees no two stops share a number.
  const { data: last } = await supabase
    .from("route_stops")
    .select("sequence_number")
    .eq("route_id", v.routeId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("route_stops").insert({
    route_id: v.routeId,
    service_address_id: v.serviceAddressId,
    sequence_number: (last?.sequence_number ?? 0) + 1,
  });
  if (error) {
    const duplicate = /duplicate key|already exists/i.test(error.message);
    go(here, "error", duplicate ? "That address is already on this route (or someone just added a stop - try again)." : friendlyError(error.message));
  }

  revalidatePath(here);
  go(here, "saved", "Stop added.");
}

export async function removeRouteStop(formData: FormData) {
  const supabase = await guard();
  const routeId = String(formData.get("routeId") ?? "");
  const stopId = String(formData.get("stopId") ?? "");
  const here = `/admin/routes/${routeId}`;
  if (!/^[0-9a-f-]{36}$/i.test(stopId) || !/^[0-9a-f-]{36}$/i.test(routeId)) go("/admin/routes", "error", "That stop could not be found.");

  const { error } = await supabase.from("route_stops").delete().eq("id", stopId).eq("route_id", routeId);
  if (error) go(here, "error", friendlyError(error.message));

  revalidatePath(here);
  go(here, "saved", "Stop removed.");
}

export async function scheduleRun(formData: FormData) {
  const supabase = await guard();
  const routeId = String(formData.get("routeId") ?? "");
  const here = `/admin/routes/${routeId}`;

  const parsed = scheduleRunFormSchema.safeParse({
    routeId,
    assignmentDate: formData.get("assignmentDate"),
    driverId: formData.get("driverId"),
    vehicleId: formData.get("vehicleId"),
  });
  if (!parsed.success) go(here, "error", parsed.error.issues[0]?.message ?? "Check the form.");
  const v = parsed.data;
  if (v.assignmentDate < todayNairobi()) go(here, "error", "The run date cannot be in the past.");

  // Only active drivers and vehicles can be put on a run.
  const [{ data: driver }, { data: vehicle }] = await Promise.all([
    supabase.from("drivers").select("status").eq("id", v.driverId).maybeSingle(),
    supabase.from("vehicles").select("status").eq("id", v.vehicleId).maybeSingle(),
  ]);
  if (driver?.status !== "active") go(here, "error", "That driver is not active.");
  if (vehicle?.status !== "active") go(here, "error", "That vehicle is not active (check it isn't in maintenance).");

  const { data: run, error: runError } = await supabase
    .from("daily_assignments")
    .insert({ route_id: v.routeId, assignment_date: v.assignmentDate })
    .select("id")
    .single();
  if (runError || !run) {
    const duplicate = /duplicate key|already exists/i.test(runError?.message ?? "");
    go(here, "error", duplicate ? "A run is already scheduled for this route on that date." : friendlyError(runError?.message));
  }

  const { error: legError } = await supabase
    .from("driver_assignments")
    .insert({ daily_assignment_id: run.id, driver_id: v.driverId, vehicle_id: v.vehicleId });
  if (legError) {
    // Don't leave a run with nobody on it: cancel it so it can be scheduled again.
    await supabase.from("daily_assignments").update({ status: "cancelled" }).eq("id", run.id);
    go(here, "error", friendlyError(legError.message, "The run could not be assigned to that driver. Please try again."));
  }

  revalidatePath(here);
  go(here, "saved", "Run scheduled.");
}

/** Cancels a run that has not started yet (planned only); started or finished runs are left alone. */
export async function cancelRun(formData: FormData) {
  const supabase = await guard();
  const routeId = String(formData.get("routeId") ?? "");
  const runId = String(formData.get("runId") ?? "");
  const here = `/admin/routes/${routeId}`;
  if (!/^[0-9a-f-]{36}$/i.test(routeId) || !/^[0-9a-f-]{36}$/i.test(runId)) go("/admin/routes", "error", "That run could not be found.");

  const { data, error } = await supabase
    .from("daily_assignments")
    .update({ status: "cancelled" })
    .eq("id", runId)
    .eq("route_id", routeId)
    .eq("status", "planned")
    .select("id");
  if (error) go(here, "error", friendlyError(error.message));
  if (!data || data.length === 0) go(here, "error", "Only a run that hasn't started can be cancelled.");

  revalidatePath(here);
  go(here, "saved", "Run cancelled.");
}
