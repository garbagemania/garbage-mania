import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { customerNames } from "@/lib/admin/lookups";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { formatCents, formatDateTime } from "@/lib/format";

const STATUSES: Enum<"payment_status">[] = ["pending", "confirmed", "failed", "reversed"];
const METHODS: Enum<"payment_method">[] = ["mpesa", "cheque", "cash", "bank_transfer"];

export default async function PaymentsPage({ searchParams }: { searchParams: { status?: string; method?: string; page?: string } }) {
  await requirePageRoles(["super_admin", "admin", "finance"]);
  const supabase = createSupabaseServerClient();

  // Server-side pagination: 50 rows per page, filtered in the database.
  const PAGE_SIZE = 50;
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("payments")
    .select("id, customer_id, payment_method, status, amount_cents, currency, reference, received_at")
    .order("received_at", { ascending: false })
    .range(from, to);
  const status = pick(searchParams.status, STATUSES);
  const method = pick(searchParams.method, METHODS);
  if (status) query = query.eq("status", status);
  if (method) query = query.eq("payment_method", method);
  const { data, error } = await query;
  const names = await customerNames(supabase, (data ?? []).map((p) => p.customer_id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Newest first, 50 per page. Open a payment to verify, allocate or refund it."
        action={<Link href="/admin/finance/payments/new" className="rounded-md bg-brand-green-500 px-4 py-2 text-sm text-white">Record payment</Link>}
      />
      <FilterBar
        selects={[
          { name: "status", label: "Status", value: status, options: STATUSES },
          { name: "method", label: "Method", value: method, options: METHODS },
        ]}
      />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No payments recorded."
        columns={[
          { header: "Received", cell: (p) => formatDateTime(p.received_at) },
          {
            header: "Customer",
            cell: (p) => (
              <Link href={`/admin/finance/customers/${p.customer_id}`} className="text-brand-green-700">
                {names.get(p.customer_id) ?? "View customer"}
              </Link>
            ),
          },
          { header: "Method", cell: (p) => p.payment_method.replace(/_/g, " ") },
          { header: "Reference", cell: (p) => <Link href={`/admin/finance/payments/${p.id}`} className="text-brand-green-700">{p.reference ?? "Open"}</Link> },
          { header: "Amount", cell: (p) => formatCents(p.amount_cents, p.currency), align: "right" },
          {
            header: "Status",
            cell: (p) => (
              <StatusBadge value={p.status} tones={{ pending: "warning", confirmed: "success", failed: "danger", reversed: "neutral" }} />
            ),
          },
        ]}
      />
      <div className="flex gap-4 text-sm">
        {page > 1 && <Link className="text-brand-green-700" href={`/admin/payments?${new URLSearchParams({ ...(status ? { status } : {}), ...(method ? { method } : {}), page: String(page - 1) })}`}>← Newer</Link>}
        {(data?.length ?? 0) === PAGE_SIZE && <Link className="text-brand-green-700" href={`/admin/payments?${new URLSearchParams({ ...(status ? { status } : {}), ...(method ? { method } : {}), page: String(page + 1) })}`}>Older →</Link>}
      </div>
    </div>
  );
}
