import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { customerNames } from "@/lib/admin/lookups";
import { DataTable, PageHeader } from "@/components/admin/page-kit";
import { formatCents } from "@/lib/format";
import { FINANCE_READERS, untyped } from "../../_lib";

export default async function UnallocatedPayments() {
  await requirePageRoles(FINANCE_READERS);
  const supabase = createSupabaseServerClient();
  const { data, error } = await untyped(supabase)
    .from("payment_allocation_status")
    .select("payment_id, customer_id, payment_method, amount_cents, allocated_cents, unallocated_cents, allocation_status")
    .eq("status", "confirmed")
    .gt("unallocated_cents", 0)
    .order("unallocated_cents", { ascending: false })
    .limit(200);
  type R = { id: string; payment_id: string; customer_id: string; payment_method: string; amount_cents: number; allocated_cents: number; unallocated_cents: number; allocation_status: string };
  const rows = ((data ?? []) as Omit<R, "id">[]).map((r) => ({ ...r, id: r.payment_id }));
  const names = await customerNames(supabase, rows.map((r) => r.customer_id));

  return (
    <div className="space-y-6">
      <PageHeader title="Unallocated payments" description="Verified payments that are not fully applied to invoices." />
      <DataTable
        error={error}
        rows={rows}
        emptyMessage="No unallocated payments."
        columns={[
          { header: "Customer", cell: (r) => names.get(r.customer_id) ?? "Customer" },
          { header: "Method", cell: (r) => r.payment_method.replace(/_/g, " ") },
          { header: "Amount", cell: (r) => formatCents(r.amount_cents), align: "right" },
          { header: "Allocated", cell: (r) => formatCents(r.allocated_cents), align: "right" },
          { header: "Unallocated", cell: (r) => formatCents(r.unallocated_cents), align: "right" },
          { header: "", cell: (r) => <Link className="text-brand-green-700" href={`/admin/finance/payments/${r.payment_id}`}>Allocate</Link> },
        ]}
      />
    </div>
  );
}
