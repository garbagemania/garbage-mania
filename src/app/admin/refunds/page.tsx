import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { customerNames } from "@/lib/admin/lookups";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { formatCents, formatDateTime } from "@/lib/format";

const STATUSES: Enum<"refund_payout_status">[] = ["pending", "completed", "failed"];

export default async function RefundsPage({ searchParams }: { searchParams: { status?: string } }) {
  await requirePageRoles(["super_admin", "admin", "finance"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("refund_payouts")
    .select("id, customer_id, amount_cents, currency, payout_method, status, external_reference, completed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const status = pick(searchParams.status, STATUSES);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  const names = await customerNames(supabase, (data ?? []).map((r) => r.customer_id));

  return (
    <div className="space-y-6">
      <PageHeader title="Refunds" description="Refund payouts and their completion status." />
      <FilterBar selects={[{ name: "status", label: "Status", value: status, options: STATUSES }]} />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No refunds recorded."
        columns={[
          { header: "Created", cell: (r) => formatDateTime(r.created_at) },
          {
            header: "Customer",
            cell: (r) => (
              <Link href={`/admin/finance/customers/${r.customer_id}`} className="text-brand-green-700">
                {names.get(r.customer_id) ?? "View customer"}
              </Link>
            ),
          },
          { header: "Method", cell: (r) => r.payout_method.replace(/_/g, " ") },
          { header: "Reference", cell: (r) => r.external_reference ?? "—" },
          { header: "Amount", cell: (r) => formatCents(r.amount_cents, r.currency), align: "right" },
          { header: "Completed", cell: (r) => formatDateTime(r.completed_at) },
          {
            header: "Status",
            cell: (r) => <StatusBadge value={r.status} tones={{ pending: "warning", completed: "success", failed: "danger" }} />,
          },
        ]}
      />
    </div>
  );
}
