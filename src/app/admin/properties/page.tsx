import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { customerNames } from "@/lib/admin/lookups";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";

const STATUSES: Enum<"property_status">[] = ["active", "inactive"];
const TYPES: Enum<"property_type">[] = ["residential", "commercial", "industrial", "institutional"];

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; type?: string };
}) {
  await requirePageRoles(["super_admin", "admin", "operations_manager"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("properties")
    .select("id, name, property_type, address_line, ward, county, status, customer_id")
    .order("created_at", { ascending: false })
    .limit(100);

  const status = pick(searchParams.status, STATUSES);
  const type = pick(searchParams.type, TYPES);
  if (searchParams.q) query = query.ilike("address_line", `%${searchParams.q}%`);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("property_type", type);

  const { data, error } = await query;
  const names = await customerNames(supabase, (data ?? []).map((p) => p.customer_id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        description="Every property on record. Use “+ Add property” here, or add one from its customer's page."
        action={<Link href="/admin/properties/new"><Button>+ Add property</Button></Link>}
      />
      <FilterBar
        search={{ name: "q", label: "Search address", value: searchParams.q, placeholder: "e.g. Kenyatta Ave" }}
        selects={[
          { name: "type", label: "Type", value: type, options: TYPES },
          { name: "status", label: "Status", value: status, options: STATUSES },
        ]}
      />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No properties yet. Use “+ Add property” to create one."
        columns={[
          { header: "Property", cell: (p) => <span className="font-medium text-neutral-900">{p.name ?? p.address_line}</span> },
          { header: "Type", cell: (p) => p.property_type },
          { header: "Location", cell: (p) => [p.address_line, p.ward, p.county].filter(Boolean).join(", ") },
          {
            header: "Customer",
            cell: (p) => (
              <Link href={`/admin/customers/${p.customer_id}`} className="font-medium text-brand-green-700">
                {names.get(p.customer_id) ?? "View customer"}
              </Link>
            ),
          },
          { header: "Status", cell: (p) => <StatusBadge value={p.status} tones={{ active: "success", inactive: "neutral" }} /> },
        ]}
      />
    </div>
  );
}
