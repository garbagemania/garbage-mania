import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { DataTable, FilterBar, PageHeader } from "@/components/admin/page-kit";

export default async function StatementsPage({ searchParams }: { searchParams: { q?: string } }) {
  await requirePageRoles(["super_admin", "admin", "finance"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("customers")
    .select("id, display_name, customer_type, billing_email")
    .order("display_name", { ascending: true })
    .limit(50);
  if (searchParams.q) query = query.ilike("display_name", `%${searchParams.q}%`);
  const { data, error } = await query;

  return (
    <div className="space-y-6">
      <PageHeader title="Customer statements" description="Choose a customer to view their statement of invoices and payments." />
      <FilterBar search={{ name: "q", label: "Search customer", value: searchParams.q, placeholder: "Customer name" }} />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No customers found."
        columns={[
          { header: "Customer", cell: (c) => <span className="font-medium text-neutral-900">{c.display_name}</span> },
          { header: "Type", cell: (c) => c.customer_type },
          { header: "Billing email", cell: (c) => c.billing_email ?? "—" },
          {
            header: "",
            cell: (c) => (
              <Link href={`/admin/statements/${c.id}`} className="font-medium text-brand-green-700">
                View statement
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}
