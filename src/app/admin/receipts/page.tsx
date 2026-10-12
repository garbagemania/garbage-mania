import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { customerNames } from "@/lib/admin/lookups";
import { DataTable, FilterBar, PageHeader } from "@/components/admin/page-kit";
import { formatCents, formatDateTime } from "@/lib/format";

export default async function ReceiptsPage({ searchParams }: { searchParams: { q?: string } }) {
  await requirePageRoles(["super_admin", "admin", "finance"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("receipts")
    .select("id, receipt_number, payment_id, issued_at")
    .order("issued_at", { ascending: false })
    .limit(100);
  if (searchParams.q) query = query.ilike("receipt_number", `%${searchParams.q}%`);
  const { data, error } = await query;

  const paymentIds = (data ?? []).map((r) => r.payment_id);
  const payments = new Map<string, { customer_id: string; amount_cents: number; currency: string; payment_method: string }>();
  if (paymentIds.length > 0) {
    const { data: rows } = await supabase
      .from("payments")
      .select("id, customer_id, amount_cents, currency, payment_method")
      .in("id", paymentIds);
    for (const p of rows ?? []) payments.set(p.id, p);
  }
  const names = await customerNames(supabase, Array.from(payments.values()).map((p) => p.customer_id));

  return (
    <div className="space-y-6">
      <PageHeader title="Receipts" description="Receipts issued against recorded payments." />
      <FilterBar search={{ name: "q", label: "Receipt number", value: searchParams.q, placeholder: "e.g. RCT-0001" }} />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No receipts issued."
        columns={[
          { header: "Receipt", cell: (r) => <span className="font-medium text-neutral-900">{r.receipt_number}</span> },
          { header: "Issued", cell: (r) => formatDateTime(r.issued_at) },
          { header: "Customer", cell: (r) => names.get(payments.get(r.payment_id)?.customer_id ?? "") ?? "—" },
          { header: "Method", cell: (r) => payments.get(r.payment_id)?.payment_method.replace(/_/g, " ") ?? "—" },
          {
            header: "Amount",
            cell: (r) => {
              const p = payments.get(r.payment_id);
              return p ? formatCents(p.amount_cents, p.currency) : "—";
            },
            align: "right",
          },
        ]}
      />
    </div>
  );
}
