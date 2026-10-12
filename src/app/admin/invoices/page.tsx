import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { customerNames } from "@/lib/admin/lookups";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { formatCents, formatDay } from "@/lib/format";

const STATUSES: Enum<"invoice_status">[] = ["draft", "issued", "partially_paid", "paid", "overdue", "void"];

export default async function InvoicesPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  await requirePageRoles(["super_admin", "admin", "finance"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("invoices")
    .select("id, invoice_number, customer_id, issue_date, due_date, status, subtotal_cents, tax_cents, total_cents, currency")
    .order("issue_date", { ascending: false })
    .limit(100);
  const status = pick(searchParams.status, STATUSES);
  if (searchParams.q) query = query.ilike("invoice_number", `%${searchParams.q}%`);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  const names = await customerNames(supabase, (data ?? []).map((i) => i.customer_id));

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="The 100 most recent invoices, newest first." action={<Link href="/admin/finance/invoices/new" className="rounded-md bg-brand-green-500 px-4 py-2 text-sm text-white">New invoice</Link>} />
      <FilterBar
        search={{ name: "q", label: "Invoice number", value: searchParams.q, placeholder: "e.g. INV-0001" }}
        selects={[{ name: "status", label: "Status", value: status, options: STATUSES }]}
      />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No invoices recorded."
        columns={[
          { header: "Invoice", cell: (i) => <Link href={`/admin/finance/invoices/${i.id}`} className="font-medium text-brand-green-700">{i.invoice_number}</Link> },
          {
            header: "Customer",
            cell: (i) => (
              <Link href={`/admin/finance/customers/${i.customer_id}`} className="text-brand-green-700">
                {names.get(i.customer_id) ?? "View customer"}
              </Link>
            ),
          },
          { header: "Issued", cell: (i) => formatDay(i.issue_date) },
          { header: "Due", cell: (i) => formatDay(i.due_date) },
          { header: "Subtotal", cell: (i) => formatCents(i.subtotal_cents, i.currency), align: "right" },
          { header: "VAT", cell: (i) => formatCents(i.tax_cents, i.currency), align: "right" },
          { header: "Total", cell: (i) => formatCents(i.total_cents, i.currency), align: "right" },
          {
            header: "Status",
            cell: (i) => (
              <StatusBadge
                value={i.status}
                tones={{ draft: "neutral", issued: "info", partially_paid: "warning", paid: "success", overdue: "danger", void: "neutral" }}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
