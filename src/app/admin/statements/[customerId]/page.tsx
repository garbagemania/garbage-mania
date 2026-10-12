import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { DataTable, PageHeader } from "@/components/admin/page-kit";
import { Card, CardContent } from "@/components/ui/card";
import { PrintLetterhead, PrintButton } from "@/components/brand/print-kit";
import { formatCents, formatDay } from "@/lib/format";

interface Line {
  id: string;
  at: number;
  date: string;
  description: string;
  charge: number;
  payment: number;
  balance: number;
}

/**
 * Statement = issued invoices (charges) minus confirmed payments, in date
 * order with a running balance. Draft and void invoices and pending, failed
 * or reversed payments are excluded. Positive balance = customer owes us.
 */
export default async function CustomerStatementPage({ params }: { params: { customerId: string } }) {
  await requirePageRoles(["super_admin", "admin", "finance"]);
  const supabase = createSupabaseServerClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, display_name, billing_email")
    .eq("id", params.customerId)
    .maybeSingle();
  if (!customer) notFound();

  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, invoice_number, issue_date, total_cents")
    .eq("customer_id", customer.id)
    .in("status", ["issued", "partially_paid", "paid", "overdue"])
    .limit(1000);

  const { data: payments, error: paymentError } = await supabase
    .from("payments")
    .select("id, received_at, amount_cents, payment_method, reference")
    .eq("customer_id", customer.id)
    .eq("status", "confirmed")
    .limit(1000);

  const raw = [
    ...(invoices ?? []).map((i) => ({
      id: `inv-${i.id}`,
      at: new Date(i.issue_date).getTime(),
      date: i.issue_date,
      description: `Invoice ${i.invoice_number}`,
      charge: i.total_cents,
      payment: 0,
    })),
    ...(payments ?? []).map((p) => ({
      id: `pay-${p.id}`,
      at: new Date(p.received_at).getTime(),
      date: p.received_at,
      description: `Payment (${p.payment_method.replace(/_/g, " ")})${p.reference ? ` – ${p.reference}` : ""}`,
      charge: 0,
      payment: p.amount_cents,
    })),
  ].sort((a, b) => a.at - b.at);

  let running = 0;
  const lines: Line[] = raw.map((l) => {
    running += l.charge - l.payment;
    return { ...l, balance: running };
  });
  const totalCharged = raw.reduce((sum, l) => sum + l.charge, 0);
  const totalPaid = raw.reduce((sum, l) => sum + l.payment, 0);

  return (
    <div className="space-y-6">
      <PrintLetterhead />
      <p className="text-sm print:hidden">
        <Link href="/admin/statements" className="text-brand-green-700">
          ← Customer statements
        </Link>
      </p>
      <PageHeader title={`Statement – ${customer.display_name}`} description={customer.billing_email ?? undefined} action={<PrintButton />} />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total invoiced", value: totalCharged },
          { label: "Total paid", value: totalPaid },
          { label: "Balance owed", value: totalCharged - totalPaid },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent>
              <p className="text-xs uppercase text-neutral-500">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{formatCents(m.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        error={invoiceError ?? paymentError}
        rows={lines}
        emptyMessage="No issued invoices or confirmed payments for this customer."
        columns={[
          { header: "Date", cell: (l) => formatDay(l.date) },
          { header: "Description", cell: (l) => l.description },
          { header: "Charges", cell: (l) => (l.charge ? formatCents(l.charge) : "—"), align: "right" },
          { header: "Payments", cell: (l) => (l.payment ? formatCents(l.payment) : "—"), align: "right" },
          { header: "Balance", cell: (l) => formatCents(l.balance), align: "right" },
        ]}
      />
    </div>
  );
}
