import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { profileNames } from "@/lib/admin/lookups";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { formatDateTime, formatDay } from "@/lib/format";

const STATUSES: Enum<"reconciliation_batch_status">[] = ["open", "completed", "completed_with_exceptions"];

export default async function ReconciliationPage({ searchParams }: { searchParams: { status?: string } }) {
  await requirePageRoles(["super_admin", "admin", "finance"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("reconciliation_batches")
    .select("id, batch_type, period_start, period_end, status, performed_by, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const status = pick(searchParams.status, STATUSES);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  const people = await profileNames(supabase, (data ?? []).map((b) => b.performed_by));

  return (
    <div className="space-y-6">
      <PageHeader title="Reconciliation" description="Reconciliation batches of payments against invoices and accounts." />
      <FilterBar selects={[{ name: "status", label: "Status", value: status, options: STATUSES }]} />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No reconciliation batches recorded."
        columns={[
          { header: "Created", cell: (b) => formatDateTime(b.created_at) },
          { header: "Type", cell: (b) => b.batch_type.replace(/_/g, " ") },
          { header: "Period", cell: (b) => `${formatDay(b.period_start)} – ${formatDay(b.period_end)}` },
          { header: "Performed by", cell: (b) => (b.performed_by ? people.get(b.performed_by) ?? "—" : "—") },
          {
            header: "Status",
            cell: (b) => (
              <StatusBadge value={b.status} tones={{ open: "warning", completed: "success", completed_with_exceptions: "danger" }} />
            ),
          },
        ]}
      />
    </div>
  );
}
