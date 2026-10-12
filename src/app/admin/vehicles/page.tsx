import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/admin/form-kit";

const STATUSES: Enum<"vehicle_status">[] = ["active", "in_maintenance", "out_of_service"];

export default async function VehiclesPage({ searchParams }: { searchParams: { q?: string; status?: string; saved?: string; error?: string } }) {
  const user = await requirePageRoles(["super_admin", "admin", "operations_manager"]);
  const canManage = user.role === "super_admin" || user.role === "operations_manager";
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("vehicles")
    .select("id, registration_number, vehicle_type, capacity_kg, status")
    .order("registration_number", { ascending: true })
    .limit(200);
  const status = pick(searchParams.status, STATUSES);
  if (searchParams.q) query = query.ilike("registration_number", `%${searchParams.q}%`);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles"
        description="Fleet vehicles and their current status."
        action={canManage ? <Link href="/admin/vehicles/new"><Button>+ Add vehicle</Button></Link> : undefined}
      />
      <FormMessage error={searchParams.error} saved={searchParams.saved} />
      <FilterBar
        search={{ name: "q", label: "Search registration", value: searchParams.q, placeholder: "e.g. KDA 123A" }}
        selects={[{ name: "status", label: "Status", value: status, options: STATUSES }]}
      />
      <DataTable
        error={error}
        rows={data}
        emptyMessage={canManage ? "No vehicles yet. Use “+ Add vehicle” to register your first one." : "No vehicles found."}
        columns={[
          {
            header: "Registration",
            cell: (v) =>
              canManage ? (
                <Link href={`/admin/vehicles/${v.id}`} className="font-medium text-brand-green-700">{v.registration_number}</Link>
              ) : (
                <span className="font-medium text-neutral-900">{v.registration_number}</span>
              ),
          },
          { header: "Type", cell: (v) => v.vehicle_type ?? "—" },
          { header: "Capacity (kg)", cell: (v) => (v.capacity_kg === null ? "—" : v.capacity_kg.toLocaleString("en-KE")), align: "right" },
          {
            header: "Status",
            cell: (v) => (
              <StatusBadge value={v.status} tones={{ active: "success", in_maintenance: "warning", out_of_service: "danger" }} />
            ),
          },
        ]}
      />
    </div>
  );
}
