import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { DataTable, FilterBar, PageHeader } from "@/components/admin/page-kit";
import { formatCents } from "@/lib/format";
import { FINANCE_READERS, untyped } from "../_lib";

export default async function FinanceCustomers({ searchParams }: { searchParams: { q?: string } }) {
  await requirePageRoles(FINANCE_READERS);
  const supabase = createSupabaseServerClient();
  let query = supabase.from("customers").select("id, display_name, customer_type, status").order("display_name").limit(100);
  const q = (searchParams.q ?? "").trim().replace(/[%,()]/g, "");
  if (q) query = query.ilike("display_name", `%${q}%`);
  const { data, error } = await query;

  const ids = (data ?? []).map((c) => c.id);
  const balances = new Map<string, number>();
  if (ids.length) {
    const { data: b } = await untyped(supabase).from("customer_balances").select("customer_id, balance_cents").in("customer_id", ids);
    for (const r of (b ?? []) as { customer_id: string; balance_cents: number }[]) balances.set(r.customer_id, Number(r.balance_cents));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Customer accounts" description="Search a customer to open their financial account." />
      <FilterBar search={{ name: "q", label: "Customer name", value: searchParams.q, placeholder: "Search…" }} />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No customers found."
        columns={[
          { header: "Customer", cell: (c) => <Link className="font-medium text-brand-green-700" href={`/admin/finance/customers/${c.id}`}>{c.display_name}</Link> },
          { header: "Type", cell: (c) => c.customer_type },
          { header: "Status", cell: (c) => c.status },
          { header: "Balance", cell: (c) => formatCents(balances.get(c.id) ?? 0), align: "right" },
        ]}
      />
    </div>
  );
}
