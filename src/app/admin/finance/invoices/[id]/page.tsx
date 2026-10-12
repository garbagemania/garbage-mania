import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader, StatusBadge } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { PrintLetterhead, PrintButton } from "@/components/brand/print-kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDay, formatDateTime } from "@/lib/format";
import { FINANCE_READERS, FINANCE_WRITERS, INVOICE_TONES, Notice, Stat, fieldClass, untyped } from "../../_lib";
import { FINANCE_DELETERS } from "@/types/roles";
import { invoiceAction } from "../../actions";

type Row = Record<string, string | number | null>;

export default async function InvoiceDetail({ params, searchParams }: { params: { id: string }; searchParams: { saved?: string; error?: string } }) {
  const user = await requirePageRoles(FINANCE_READERS);
  const supabase = createSupabaseServerClient();
  const db = untyped(supabase);
  const canWrite = !!user.role && FINANCE_WRITERS.includes(user.role);
  const canDelete = !!user.role && FINANCE_DELETERS.includes(user.role);

  const { data: inv } = await db.from("invoices").select("*").eq("id", params.id).maybeSingle();
  if (!inv) notFound();

  const [{ data: items }, { data: bal }, { data: customer }, { data: allocations }, { data: credits }] = await Promise.all([
    db.from("invoice_items").select("*").eq("invoice_id", inv.id).order("created_at"),
    db.from("invoice_balances").select("paid_cents, credited_cents, outstanding_cents, is_overdue, days_overdue").eq("invoice_id", inv.id).maybeSingle(),
    supabase.from("customers").select("id, display_name").eq("id", inv.customer_id).maybeSingle(),
    db.from("payment_allocations").select("id, payment_id, amount_cents, created_at").eq("invoice_id", inv.id).order("created_at"),
    db.from("credit_notes").select("id, credit_note_number, total_cents, reason, created_at").eq("invoice_id", inv.id).order("created_at"),
  ]);
  const status = bal?.is_overdue ? "overdue" : inv.status;

  return (
    <div className="space-y-6">
      <PrintLetterhead />
      <PageHeader title={`Invoice ${inv.invoice_number}`} description={customer?.display_name ?? ""} action={<div className="flex items-center gap-2"><PrintButton /><StatusBadge value={status} tones={INVOICE_TONES} /></div>} />
      <Notice saved={searchParams.saved} error={searchParams.error} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Subtotal" value={formatCents(inv.subtotal_cents, inv.currency)} />
        <Stat label="VAT" value={formatCents(inv.tax_cents, inv.currency)} />
        <Stat label="Total" value={formatCents(inv.total_cents, inv.currency)} />
        <Stat
          label="Balance due"
          value={formatCents(inv.status === "draft" ? inv.total_cents : Number(bal?.outstanding_cents ?? 0), inv.currency)}
          hint={inv.status === "draft" ? "Draft - not yet on the ledger" : `Paid ${formatCents(Number(bal?.paid_cents ?? 0))} · Credited ${formatCents(Number(bal?.credited_cents ?? 0))}`}
        />
      </div>

      <p className="text-sm text-neutral-600">
        Invoice date {formatDay(inv.issue_date)} · Due {formatDay(inv.due_date)}
        {inv.billing_period_start ? ` · Period ${formatDay(inv.billing_period_start)} – ${formatDay(inv.billing_period_end)}` : ""}
        {inv.issued_at ? ` · Issued ${formatDateTime(inv.issued_at)}` : ""}
        {bal?.is_overdue ? ` · ${bal.days_overdue} day(s) overdue` : ""}
      </p>
      {inv.notes && <p className="text-sm text-neutral-700">{inv.notes}</p>}
      {inv.voided_reason && <p className="text-sm text-danger">Cancelled: {inv.voided_reason}</p>}

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-500">
              <tr><th className="py-1">Description</th><th>Qty</th><th className="text-right">Unit price</th><th className="text-right">Net</th><th className="text-right">VAT %</th><th className="text-right">VAT</th><th className="text-right">Line total</th></tr>
            </thead>
            <tbody>
              {((items ?? []) as Row[]).map((l) => (
                <tr key={String(l.id)} className="border-t border-neutral-100">
                  <td className="py-1">{String(l.description)}</td>
                  <td>{String(l.quantity)}</td>
                  <td className="text-right">{formatCents(Number(l.unit_price_cents))}</td>
                  <td className="text-right">{formatCents(Number(l.amount_cents))}</td>
                  <td className="text-right">{Number(l.vat_rate_bp) / 100}%</td>
                  <td className="text-right">{formatCents(Number(l.vat_cents))}</td>
                  <td className="text-right">{formatCents(Number(l.line_total_cents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {((allocations ?? []).length > 0 || (credits ?? []).length > 0) && (
        <Card>
          <CardHeader><CardTitle>Settled by</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {((allocations ?? []) as Row[]).map((a) => (
              <p key={String(a.id)}>
                <Link className="text-brand-green-700" href={`/admin/finance/payments/${a.payment_id}`}>Payment</Link> allocated {formatCents(Number(a.amount_cents))} on {formatDay(String(a.created_at))}
              </p>
            ))}
            {((credits ?? []) as Row[]).map((c) => (
              <p key={String(c.id)}>Credit note {String(c.credit_note_number)}: {formatCents(Number(c.total_cents))} - {String(c.reason)}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {(canWrite || canDelete) && (
        <div className="flex flex-wrap items-end gap-4">
          {inv.status === "draft" && (
            <>
              {canWrite && (
                <form action={invoiceAction}><input type="hidden" name="invoiceId" value={inv.id} /><Button type="submit" name="intent" value="issue">Issue invoice</Button></form>
              )}
              {canDelete && (
                <form action={invoiceAction}><input type="hidden" name="invoiceId" value={inv.id} /><Button type="submit" name="intent" value="discard" variant="outline">Discard draft</Button></form>
              )}
            </>
          )}
          {canWrite && ["issued", "overdue"].includes(inv.status) && Number(bal?.paid_cents ?? 0) === 0 && Number(bal?.credited_cents ?? 0) === 0 && (
            <form action={invoiceAction} className="flex items-end gap-2">
              <input type="hidden" name="invoiceId" value={inv.id} />
              <input type="hidden" name="intent" value="cancel" />
              <input name="reason" required maxLength={500} placeholder="Reason for cancelling" aria-label="Cancellation reason" className={fieldClass} />
              <Button type="submit" variant="danger">Cancel invoice</Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
