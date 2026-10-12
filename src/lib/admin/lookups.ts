import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

function unique(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => !!id)));
}

/** customer id -> display name, read through the caller's RLS-scoped client. */
export async function customerNames(supabase: Client, ids: Array<string | null | undefined>) {
  const map = new Map<string, string>();
  const list = unique(ids);
  if (list.length === 0) return map;
  const { data } = await supabase.from("customers").select("id, display_name").in("id", list);
  for (const row of data ?? []) map.set(row.id, row.display_name);
  return map;
}

/** profile id -> full name (staff or customer logins). */
export async function profileNames(supabase: Client, ids: Array<string | null | undefined>) {
  const map = new Map<string, string>();
  const list = unique(ids);
  if (list.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", list);
  for (const row of data ?? []) map.set(row.id, row.full_name);
  return map;
}

/** Active drivers as {id, label} for dropdowns ("Name (employee no.)"). */
export async function activeDriverOptions(supabase: Client) {
  const { data: drivers } = await supabase.from("drivers").select("id").eq("status", "active");
  const ids = (drivers ?? []).map((d) => d.id);
  if (ids.length === 0) return [] as { id: string; label: string }[];
  const [{ data: people }, { data: staff }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", ids),
    supabase.from("staff_profiles").select("id, employee_number").in("id", ids),
  ]);
  const emp = new Map((staff ?? []).map((s) => [s.id, s.employee_number]));
  return (people ?? [])
    .map((p) => ({ id: p.id, label: emp.get(p.id) ? `${p.full_name} (${emp.get(p.id)})` : p.full_name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Active vehicles as {id, label} for dropdowns. */
export async function activeVehicleOptions(supabase: Client) {
  const { data } = await supabase
    .from("vehicles")
    .select("id, registration_number, vehicle_type")
    .eq("status", "active")
    .order("registration_number", { ascending: true });
  return (data ?? []).map((v) => ({
    id: v.id,
    label: v.vehicle_type ? `${v.registration_number} · ${v.vehicle_type}` : v.registration_number,
  }));
}
