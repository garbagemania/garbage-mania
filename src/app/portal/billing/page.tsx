import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/admin/page-kit";
import { formatCents, formatDateTime, formatDay } from "@/lib/format";
import { getPortalContext } from "@/lib/portal/customer";
import { loadCustomerFinancials, type InvoiceWithBalance, type PaymentRow } from "@/lib/portal/finance";
import {
  INVOICE_TONE,
  LoadError,
  NoCustomerAccount,
  PAYMENT_TONE,
  StatCard,
  Status,
  label,
} from "@/components/portal/portal-ui";

export default async function BillingPage() {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  const [financials, intentsRes] = await Promise.all([
    loadCustomerFinancials(supabase),
    supabase
      .from("mpesa_payment_intents")
      .select("id, amount_cents, status, created_at, invoice_id")
      .eq("customer_id", customerId)
      .in("status", ["initiated", "pending"])
      .order("created_at", { ascending: false }),
  ]);

  if (financials.error || !financials.data) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Billing</h1>
        <LoadError message={financials.error ?? "No data returned."} />
      </>
    );
  }

  const fin = financials.data;
  const invoiceIds = fin.invoices.map((i) => i.id);
  const itemsRes = await supabase
    .from("invoice_items")
    .select("id, invoice_id, description, quantity, amount_cents")
    .in("invoice_id", invoiceIds);

  const itemsByInvoice = new Map<string, { id: string; description: string; quantity: number; amount_cents: number }[]>();
  for (const it of itemsRes.data ?? []) {
    const list = itemsByInvoice.get(it.invoice_id) ?? [];
    list.push({ id: it.id, description: it.description, quantity: Number(it.quantity), amount_cents: Number(it.amount_cents) });
    itemsByInvoice.set(it.invoice_id, list);
  }

  const receiptByPayment = new Map(fin.receipts.map((r) => [r.payment_id, r]));
  const pendingPayments = fin.payments.filter((p) => p.status === "pending");
  const pendingIntents = intentsRes.data ?? [];
  const pendingCount = pendingPayments.length + pendingIntents.length;

  const invoiceColumns = [
    { header: "Invoice", cell: (i: InvoiceWithBalance) => <span className="font-medium">{i.invoice_number}</span> },
    { header: "Issued", cell: (i: InvoiceWithBalance) => formatDay(i.issue_date) },
    { header: "Due", cell: (i: InvoiceWithBalance) => formatDay(i.due_date) },
    { header: "Status", cell: (i: InvoiceWithBalance) => <Status value={i.status} tones={INVOICE_TONE} /> },
    {
      header: "VAT",
      align: "right" as const,
      cell: (i: InvoiceWithBalance) => (i.tax_cents > 0 ? formatCents(i.tax_cents, i.currency) : "—"),
    },
    { header: "Total", align: "right" as const, cell: (i: InvoiceWithBalance) => formatCents(i.total_cents, i.currency) },
    { header: "Paid", align: "right" as const, cell: (i: InvoiceWithBalance) => formatCents(i.paid_cents, i.currency) },
    {
      header: "Balance",
      align: "right" as const,
      cell: (i: InvoiceWithBalance) => (
        <span className="font-medium">{formatCents(i.outstanding_cents, i.currency)}</span>
      ),
    },
    {
      header: "Details",
      cell: (i: InvoiceWithBalance) => {
        const items = itemsByInvoice.get(i.id) ?? [];
        if (items.length === 0) return "—";
        return (
          <details>
            <summary className="cursor-pointer text-brand-green-600">Items ({items.length})</summary>
            <ul className="mt-1 space-y-1 text-xs">
              {items.map((it) => (
                <li key={it.id}>
                  {it.description}
                  {it.quantity !== 1 ? ` × ${it.quantity}` : ""} — {formatCents(it.amount_cents, i.currency)}
                </li>
              ))}
            </ul>
          </details>
        );
      },
    },
  ];

  const paymentColumns = [
    { header: "Date", cell: (p: PaymentRow) => formatDateTime(p.received_at) },
    { header: "Method", cell: (p: PaymentRow) => label(p.payment_method) },
    { header: "Reference", cell: (p: PaymentRow) => p.reference ?? "—" },
    { header: "Status", cell: (p: PaymentRow) => <Status value={p.status} tones={PAYMENT_TONE} /> },
    { header: "Amount", align: "right" as const, cell: (p: PaymentRow) => formatCents(Number(p.amount_cents), p.currency) },
    {
      header: "Receipt",
      cell: (p: PaymentRow) => {
        const r = receiptByPayment.get(p.id);
        return r ? (
          <span>
            {r.receipt_number}
            <span className="block text-xs text-neutral-500">{formatDay(r.issued_at)}</span>
          </span>
        ) : (
          "—"
        );
      },
    },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Billing</h1>
        <p className="text-sm text-neutral-600">Your invoices, payments and receipts.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Outstanding balance"
          value={formatCents(fin.outstandingCents)}
          hint={fin.outstandingCents > 0 ? "Total owed across unpaid invoices" : "No outstanding invoices"}
        />
        <StatCard
          label="Pending payments"
          value={pendingCount === 0 ? "None" : `${pendingCount} pending`}
          hint={pendingCount === 0 ? undefined : "Not counted against your balance until confirmed"}
        />
      </section>

      {pendingIntents.length > 0 && (
        <Card className="border-brand-yellow-300 bg-brand-yellow-50">
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium text-neutral-900">M-Pesa payments awaiting confirmation</p>
            <ul className="text-neutral-700">
              {pendingIntents.map((i) => (
                <li key={i.id}>
                  {formatCents(Number(i.amount_cents))} · started {formatDateTime(i.created_at)} ·{" "}
                  <span className="font-medium">pending</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500">
              These are shown as pending until Safaricom confirms the payment. Your invoices are not marked paid until then.
            </p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Invoices</h2>
        <DataTable rows={fin.invoices} emptyMessage="No invoices have been issued yet." columns={invoiceColumns} />
        {itemsRes.error && <LoadError message={itemsRes.error.message} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Payments &amp; receipts</h2>
        <DataTable rows={fin.payments} emptyMessage="No payments recorded" columns={paymentColumns} />
      </section>

      <Card>
        <CardContent className="text-sm text-neutral-600">
          Online payment isn&apos;t available in the portal yet. Payments are recorded by Garbage Mania when they are
          received, and appear above with a receipt once confirmed.
        </CardContent>
      </Card>
    </>
  );
}
