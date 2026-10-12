import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { customerNames } from "@/lib/admin/lookups";
import { DataTable, PageHeader, StatusBadge } from "@/components/admin/page-kit";
import { formatCents, formatDateTime } from "@/lib/format";

/**
 * Read-only view of what is actually recorded in mpesa_payment_intents and
 * mpesa_transactions. Nothing here initiates or simulates a payment.
 */
export default async function MpesaPage() {
  await requirePageRoles(["super_admin", "admin", "finance"]);
  const supabase = createSupabaseServerClient();

  const { data: transactions, error: txError } = await supabase
    .from("mpesa_transactions")
    .select("id, mpesa_receipt_number, phone_number, amount_cents, transacted_at, payment_id")
    .order("transacted_at", { ascending: false })
    .limit(50);

  const { data: intents, error: intentError } = await supabase
    .from("mpesa_payment_intents")
    .select("id, customer_id, invoice_id, phone_number, amount_cents, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const names = await customerNames(supabase, (intents ?? []).map((i) => i.customer_id));

  return (
    <div className="space-y-8">
      <PageHeader title="M-Pesa" description="Payment requests and completed M-Pesa transactions on record." />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-neutral-900">Completed transactions</h2>
        <DataTable
          error={txError}
          rows={transactions}
          emptyMessage="No M-Pesa transactions recorded."
          columns={[
            { header: "Transacted", cell: (t) => formatDateTime(t.transacted_at) },
            { header: "M-Pesa receipt", cell: (t) => <span className="font-medium text-neutral-900">{t.mpesa_receipt_number}</span> },
            { header: "Phone", cell: (t) => t.phone_number },
            { header: "Linked payment", cell: (t) => (t.payment_id ? "Yes" : "Not yet linked") },
            { header: "Amount", cell: (t) => formatCents(t.amount_cents), align: "right" },
          ]}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-neutral-900">Payment requests</h2>
        <DataTable
          error={intentError}
          rows={intents}
          emptyMessage="No M-Pesa payment requests recorded."
          columns={[
            { header: "Requested", cell: (i) => formatDateTime(i.created_at) },
            { header: "Customer", cell: (i) => names.get(i.customer_id) ?? "—" },
            { header: "Phone", cell: (i) => i.phone_number },
            { header: "Amount", cell: (i) => formatCents(i.amount_cents), align: "right" },
            {
              header: "Status",
              cell: (i) => (
                <StatusBadge
                  value={i.status}
                  tones={{ initiated: "info", pending: "warning", completed: "success", failed: "danger", expired: "neutral" }}
                />
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
