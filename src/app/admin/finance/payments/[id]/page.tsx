import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader, StatusBadge } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDay, formatDateTime } from "@/lib/format";
import { FINANCE_READERS, FINANCE_WRITERS, Notice, PAYMENT_LABELS, PAYMENT_TONES, Stat, fieldClass, untyped } from "../../_lib";
import { allocatePaymentAction, refundAction, verifyPaymentAction } from "../../actions";

type Row = Record<string, string | number | null>;

export default async function PaymentDetail({ params, searchParams }: { params: { id: string }; searchParams: { saved?: string; error?: string } }) {
  const user = await requirePageRoles(FINANCE_READERS);
  const supabase = createSupabaseServerClient();
  const db = untyped(supabase);
  const canWrite = !!user.role && FINANCE_WRITERS.includes(user.role);

  const { data: pay } = await db.from("payments").select("*").eq("id", params.id).maybeSingle();
  if (!pay) notFound();
  const p = pay as Row;

  const [{ data: alloc }, { data: cheque }, { data: customer }, { data: openInvoices }, { data: refunds }, { data: status }] = await Promise.all([
    db.from("payment_allocations").select("id, invoice_id, amount_cents, created_at").eq("payment_id", params.id),
    db.from("cheque_payments").select("*").eq("payment_id", params.id).maybeSingle(),
    supabase.from("customers").select("id, display_name").eq("id", String(p.customer_id)).maybeSingle(),
    db.from("invoice_balances").select("invoice_id, invoice_number, outstanding_cents, due_date").eq("customer_id", p.customer_id).in("status", ["issued", "partially_paid", "overdue"]).gt("outstanding_cents", 0).order("due_date"),
    db.from("refund_payouts").select("*").eq("payment_id", params.id).order("created_at"),
    db.from("payment_allocation_status").select("allocated_cents, unallocated_cents, allocation_status").eq("payment_id", params.id).maybeSingle(),
  ]);

  // Private document: short-lived signed URL, generated per request.
  let docUrl: string | null = null;
  if (p.document_id) {
    const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", String(p.document_id)).maybeSingle();
    if (doc) {
      const { data: signed } = await supabase.storage.from("cheque-images").createSignedUrl(doc.storage_path, 300);
      docUrl = signed?.signedUrl ?? null;
    }
  }

  const st = String(p.status);
  const unallocated = Number(status?.unallocated_cents ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payment ${String(p.internal_reference ?? "")}`}
        description={customer?.display_name ?? ""}
        action={<StatusBadge value={st} tones={PAYMENT_TONES} />}
      />
      <Notice saved={searchParams.saved} error={searchParams.error} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Amount" value={formatCents(Number(p.amount_cents), String(p.currency))} hint={PAYMENT_LABELS[st]} />
        <Stat label="Method" value={String(p.payment_method).replace(/_/g, " ")} hint={p.reference ? `Ref ${p.reference}` : undefined} />
        <Stat label="Received" value={formatDateTime(String(p.received_at))} />
        <Stat label="Allocation" value={String(status?.allocation_status ?? "-").replace(/_/g, " ")} hint={st === "confirmed" ? `Unallocated ${formatCents(unallocated)}` : "Allocatable once verified"} />
      </div>

      {p.notes && <p className="text-sm text-neutral-700">{String(p.notes)}</p>}
      {p.verified_at && <p className="text-sm text-neutral-600">{st === "failed" ? "Rejected" : "Verified"} {formatDateTime(String(p.verified_at))}{p.verification_notes ? ` - ${p.verification_notes}` : ""}</p>}

      {cheque && (
        <Card>
          <CardHeader><CardTitle>Cheque</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>No. {String(cheque.cheque_number)} · {String(cheque.bank_name)} · status {String(cheque.status).replace(/_/g, " ")}</p>
            {cheque.cheque_date && <p>Cheque date {formatDay(String(cheque.cheque_date))}</p>}
            {cheque.received_date && <p>Received {formatDay(String(cheque.received_date))}</p>}
          </CardContent>
        </Card>
      )}
      {docUrl && <p className="text-sm"><a className="text-brand-green-700 underline" href={docUrl} target="_blank" rel="noopener noreferrer">View attached document</a> <span className="text-neutral-500">(private link, expires in 5 minutes)</span></p>}

      {canWrite && st === "pending" && (
        <Card>
          <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
          <CardContent>
            <form action={verifyPaymentAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="paymentId" value={params.id} />
              <input name="notes" maxLength={1000} placeholder="Verification notes (required to reject)" aria-label="Verification notes" className={`${fieldClass} max-w-md`} />
              <Button type="submit" name="decision" value="approve">Verify</Button>
              <Button type="submit" name="decision" value="reject" variant="danger">Reject</Button>
            </form>
            <p className="mt-2 text-xs text-neutral-500">Nothing is posted to the customer&apos;s balance until you verify.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Allocations</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {((alloc ?? []) as Row[]).length === 0 && <p className="text-neutral-600">No allocations yet.</p>}
          {((alloc ?? []) as Row[]).map((a) => (
            <p key={String(a.id)}><Link className="text-brand-green-700" href={`/admin/finance/invoices/${a.invoice_id}`}>Invoice</Link> - {formatCents(Number(a.amount_cents))} on {formatDay(String(a.created_at))}</p>
          ))}
          {canWrite && st === "confirmed" && unallocated > 0 && (
            ((openInvoices ?? []) as Row[]).length === 0 ? (
              <p className="text-neutral-600">This customer has no open invoices to allocate to.</p>
            ) : (
              <form action={allocatePaymentAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="paymentId" value={params.id} />
                <select name="invoiceId" required defaultValue="" aria-label="Invoice" className={`${fieldClass} max-w-xs`}>
                  <option value="" disabled>Select an invoice…</option>
                  {((openInvoices ?? []) as Row[]).map((i) => <option key={String(i.invoice_id)} value={String(i.invoice_id)}>{String(i.invoice_number)} - outstanding {formatCents(Number(i.outstanding_cents))}</option>)}
                </select>
                <input name="amount" required inputMode="decimal" placeholder={`Up to ${formatCents(unallocated)}`} aria-label="Amount" className={`${fieldClass} max-w-[12rem]`} />
                <Button type="submit">Allocate</Button>
              </form>
            )
          )}
        </CardContent>
      </Card>

      {(st === "confirmed" || ((refunds ?? []) as Row[]).length > 0) && (
        <Card>
          <CardHeader><CardTitle>Refunds</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {((refunds ?? []) as Row[]).map((r) => (
              <div key={String(r.id)} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2">
                <span>{formatCents(Number(r.amount_cents))} via {String(r.payout_method).replace(/_/g, " ")} - {String(r.reason ?? "")}</span>
                <StatusBadge value={String(r.status)} tones={{ pending: "warning", completed: "success", failed: "danger" }} />
                {r.status === "pending" && canWrite && (
                  <form action={refundAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="paymentId" value={params.id} />
                    <input type="hidden" name="refundId" value={String(r.id)} />
                    {!r.approved_by ? (
                      <>
                        <Button type="submit" name="intent" value="approve" size="sm">Approve</Button>
                        <input name="reason" maxLength={500} placeholder="Reason (to reject)" aria-label="Rejection reason" className={`${fieldClass} h-8 w-48`} />
                        <Button type="submit" name="intent" value="reject" variant="danger" size="sm">Reject</Button>
                      </>
                    ) : (
                      <>
                        <input name="reference" maxLength={100} placeholder="Payout reference" aria-label="Payout reference" className={`${fieldClass} h-8 w-48`} />
                        <Button type="submit" name="intent" value="complete" size="sm">Mark paid out</Button>
                      </>
                    )}
                  </form>
                )}
              </div>
            ))}
            {canWrite && st === "confirmed" && (
              <form action={refundAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="paymentId" value={params.id} />
                <input type="hidden" name="intent" value="request" />
                <input name="amount" required inputMode="decimal" placeholder="Refund amount" aria-label="Refund amount" className={`${fieldClass} max-w-[10rem]`} />
                <select name="method" required defaultValue="" aria-label="Refund method" className={`${fieldClass} max-w-[12rem]`}>
                  <option value="" disabled>Method…</option>
                  <option value="mpesa_b2c">M-Pesa</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option>
                </select>
                <input name="reason" required maxLength={500} placeholder="Reason" aria-label="Refund reason" className={`${fieldClass} max-w-xs`} />
                <Button type="submit" variant="outline">Request refund</Button>
              </form>
            )}
            <p className="text-xs text-neutral-500">A refund reaches the ledger only when it is approved and marked paid out. The requester cannot approve their own refund (a super admin can).</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
