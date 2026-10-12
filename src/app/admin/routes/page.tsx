import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { profileNames } from "@/lib/admin/lookups";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { FormMessage } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

const STATUSES: Enum<"property_status">[] = ["active", "inactive"];

export default async function RoutesPage({ searchParams }: { searchParams: { q?: string; status?: string; saved?: string; error?: string } }) {
  const user = await requirePageRoles(["super_admin", "admin", "operations_manager"]);
  const canManage = user.role === "super_admin" || user.role === "operations_manager";
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("routes")
    .select("id, name, area, status, default_driver_id, default_vehicle_id")
    .order("name", { ascending: true })
    .limit(200);
  const status = pick(searchParams.status, STATUSES);
  if (searchParams.q) query = query.ilike("name", `%${searchParams.q}%`);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;

  const routeIds = (data ?? []).map((r) => r.id);
  const vehicleIds = (data ?? []).map((r) => r.default_vehicle_id).filter((v): v is string => !!v);

  const stopCounts = new Map<string, number>();
  if (routeIds.length > 0) {
    const { data: stops } = await supabase.from("route_stops").select("route_id").in("route_id", routeIds);
    for (const s of stops ?? []) stopCounts.set(s.route_id, (stopCounts.get(s.route_id) ?? 0) + 1);
  }
  const vehicles = new Map<string, string>();
  if (vehicleIds.length > 0) {
    const { data: v } = await supabase.from("vehicles").select("id, registration_number").in("id", vehicleIds);
    for (const row of v ?? []) vehicles.set(row.id, row.registration_number);
  }
  const drivers = await profileNames(supabase, (data ?? []).map((r) => r.default_driver_id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Routes"
        description="Collection routes with their stops and default driver and vehicle."
        action={canManage ? <Link href="/admin/routes/new"><Button>+ New route</Button></Link> : undefined}
      />
      <FormMessage error={searchParams.error} saved={searchParams.saved} />
      <FilterBar
        search={{ name: "q", label: "Search route", value: searchParams.q, placeholder: "Route name" }}
        selects={[{ name: "status", label: "Status", value: status, options: STATUSES }]}
      />
      <DataTable
        error={error}
        rows={data}
        emptyMessage={canManage ? "No routes yet. Use “+ New route” to create your first one." : "No routes found."}
        columns={[
          {
            header: "Route",
            cell: (r) => (
              <Link href={`/admin/routes/${r.id}`} className="font-medium text-brand-green-700">
                {r.name}
              </Link>
            ),
          },
          { header: "Area", cell: (r) => r.area ?? "—" },
          { header: "Stops", cell: (r) => stopCounts.get(r.id) ?? 0, align: "right" },
          { header: "Default driver", cell: (r) => (r.default_driver_id ? drivers.get(r.default_driver_id) ?? "—" : "—") },
          { header: "Default vehicle", cell: (r) => (r.default_vehicle_id ? vehicles.get(r.default_vehicle_id) ?? "—" : "—") },
          { header: "Status", cell: (r) => <StatusBadge value={r.status} tones={{ active: "success", inactive: "neutral" }} /> },
        ]}
      />
    </div>
  );
}
