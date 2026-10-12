import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader, StatusBadge } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDay, formatDateTime } from "@/lib/format";
import { FINANCE_READERS, FINANCE_WRITERS, INVOICE_TONES, Notice, PAYMENT_LABELS, PAYMENT_TONES, Stat, fieldClass, labelClass, untyped } from "../../_lib";
import { creditNoteAction, debitAdjustmentAction } from "../../actions";

type Row = Record<string, string | number | boolean | null>;
const TABS = ["overview", "invoices", "payments", "ledger", "adjustments", "services"] as const;

export default async function CustomerFinance({ params, searchParams }: { params: { customerId: string }; searchParams: { tab?: string; saved?: string; error?: string } }) {
  const user = await requirePageRoles(FINANCE_READERS);
  const supabase = createSupabaseServerClient();
  const db = untyped(supabase);
  const canWrite = !!user.role && FINANCE_WRITERS.includes(user.role);
  const tab = (TABS as readonly string[]).includes(searchParams.tab ?? "") ? (searchParams.tab as (typeof TABS)[number]) : "overview";
  const id = params.customerId;

  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!customer) notFound();

  const [{ data: bal }, { data: invoices }, { data: payments }, { data: contacts }] = await Promise.all([
    db.from("customer_balances").select("*").eq("customer_id", id).maybeSingle(),
    db.from("invoice_balances").select("*").eq("customer_id", id).order("issue_date", { ascending: false }).limit(200),
    db.from("payments").select("id, internal_reference, payment_method, amount_cents, status, received_at, reference").eq("customer_id", id).order("received_at", { ascending: false }).limit(200),
    supabase.from("customer_contacts").select("full_name, phone, email, title").eq("customer_id", id).order("created_at").limit(5),
  ]);
  const inv = (invoices ?? []) as Row[];
  const pays = (payments ?? []) as Row[];
  const sum = (rows: Row[], key: string, pred: (r: Row) => boolean = () => true) => rows.filter(pred).reduce((a, r) => a + Number(r[key] ?? 0), 0);
  const overdue = sum(inv, "outstanding_cents", (r) => r.is_overdue === true);
  const open = inv.filter((r) => ["issued", "partially_paid", "overdue"].includes(String(r.status)));

  const tabHref = (t: string) => `/admin/finance/customers/${id}?tab=${t}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.display_name}
        description={`${customer.customer_type} customer`}
        action={
          <div className="flex gap-2">
            <Link href={`/admin/finance/customers/${id}/statement`}><Button variant="outline">Statement</Button></Link>
            {canWrite && <Link href={`/admin/finance/invoices/new?customer=${id}`}><Button>New invoice</Button></Link>}
          </div>
        }
      />
      <Notice saved={searchParams.saved} error={searchParams.error} />
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Customer finance sections">
        {TABS.map((t) => (
          <Link key={t} href={tabHref(t)} className={`rounded-md px-3 py-1 ${t === tab ? "bg-brand-green-500 text-white" : "border border-neutral-300"}`}>
            {t === "services" ? "Contracts/Services" : t.charAt(0).toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Current balance" value={formatCents(Number(bal?.balance_cents ?? 0))} hint="Debits − credits on the ledger" />
            <Stat label="Total invoiced" value={formatCents(sum(inv, "total_cents", (r) => !["draft", "void"].includes(String(r.status))))} />
            <Stat label="Total paid" value={formatCents(sum(pays, "amount_cents", (r) => r.status === "confirmed"))} />
            <Stat label="Overdue" value={formatCents(overdue)} />
            <Stat label="Total debits" value={formatCents(Number(bal?.total_debits_cents ?? 0))} />
            <Stat label="Total credits" value={formatCents(Number(bal?.total_credits_cents ?? 0))} />
            <Stat label="Open invoices" value={open.length} />
            <Stat label="Opening balance" value={formatCents(0)} hint="Balances are built from ledger entries only" />
          </div>
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>KRA PIN: {String((customer as Row).kra_pin ?? "—")}</p>
              {((contacts ?? []) as Row[]).map((c, i) => (
                <p key={i}>{String(c.full_name)}{c.title ? ` (${c.title})` : ""} · {String(c.phone ?? "—")} · {String(c.email ?? "—")}</p>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "invoices" && (
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-2">Invoice</th><th>Date</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th><th className="p-2">Status</th></tr></thead>
            <tbody>
              {inv.length === 0 && <tr><td className="p-4 text-neutral-600" colSpan={7}>No invoices.</td></tr>}
              {inv.map((r) => (
                <tr key={String(r.invoice_id)} className="border-t border-neutral-100">
                  <td className="p-2"><Link className="text-brand-green-700" href={`/admin/finance/invoices/${r.invoice_id}`}>{String(r.invoice_number)}</Link></td>
                  <td>{formatDay(String(r.issue_date))}</td><td>{formatDay(String(r.due_date))}</td>
                  <td className="text-right">{formatCents(Number(r.total_cents))}</td><td className="text-right">{formatCents(Number(r.paid_cents))}</td><td className="text-right">{formatCents(Number(r.outstanding_cents))}</td>
                  <td className="p-2"><StatusBadge value={r.is_overdue ? "overdue" : String(r.status)} tones={INVOICE_TONES} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {tab === "payments" && (
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-2">Payment</th><th>Method</th><th>Received</th><th className="text-right">Amount</th><th className="p-2">Status</th></tr></thead>
            <tbody>
              {pays.length === 0 && <tr><td className="p-4 text-neutral-600" colSpan={5}>No payments.</td></tr>}
              {pays.map((r) => (
                <tr key={String(r.id)} className="border-t border-neutral-100">
                  <td className="p-2"><Link className="text-brand-green-700" href={`/admin/finance/payments/${r.id}`}>{String(r.reference ?? r.internal_reference)}</Link></td>
                  <td>{String(r.payment_method).replace(/_/g, " ")}</td><td>{formatDateTime(String(r.received_at))}</td>
                  <td className="text-right">{formatCents(Number(r.amount_cents))}</td>
                  <td className="p-2"><StatusBadge value={String(r.status)} tones={PAYMENT_TONES} /> <span className="sr-only">{PAYMENT_LABELS[String(r.status)]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {tab === "ledger" && <LedgerTab customerId={id} />}

      {tab === "adjustments" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {canWrite ? (
            <>
              <Card>
                <CardHeader><CardTitle>Issue credit note</CardTitle></CardHeader>
                <CardContent>
                  <form action={creditNoteAction} className="space-y-3">
                    <input type="hidden" name="customerId" value={id} />
                    <div><label htmlFor="cn-inv" className={labelClass}>Against invoice (optional)</label>
                      <select id="cn-inv" name="invoiceId" defaultValue="" className={fieldClass}>
                        <option value="">No specific invoice</option>
                        {inv.filter((r) => !["draft", "void"].includes(String(r.status))).map((r) => <option key={String(r.invoice_id)} value={String(r.invoice_id)}>{String(r.invoice_number)} - {formatCents(Number(r.total_cents))}</option>)}
                      </select></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label htmlFor="cn-amt" className={labelClass}>Amount before VAT (KES)</label><input id="cn-amt" name="amount" required inputMode="decimal" className={fieldClass} /></div>
                      <div><label htmlFor="cn-vat" className={labelClass}>VAT %</label><input id="cn-vat" name="vat" inputMode="decimal" placeholder="0" className={fieldClass} /></div>
                    </div>
                    <div><label htmlFor="cn-reason" className={labelClass}>Reason</label><input id="cn-reason" name="reason" required maxLength={500} className={fieldClass} /></div>
                    <Button type="submit">Issue credit note</Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Debit adjustment</CardTitle></CardHeader>
                <CardContent>
                  <form action={debitAdjustmentAction} className="space-y-3">
                    <input type="hidden" name="customerId" value={id} />
                    <div><label htmlFor="da-amt" className={labelClass}>Amount (KES)</label><input id="da-amt" name="amount" required inputMode="decimal" className={fieldClass} /></div>
                    <div><label htmlFor="da-reason" className={labelClass}>Reason</label><input id="da-reason" name="reason" required maxLength={500} className={fieldClass} /></div>
                    <div><label htmlFor="da-ref" className={labelClass}>Reference</label><input id="da-ref" name="reference" maxLength={100} className={fieldClass} /></div>
                    <div><label htmlFor="da-notes" className={labelClass}>Notes</label><input id="da-notes" name="notes" maxLength={1000} className={fieldClass} /></div>
                    <Button type="submit" variant="outline">Record debit adjustment</Button>
                  </form>
                </CardContent>
              </Card>
            </>
          ) : <p className="text-sm text-neutral-600">Only finance users and super admins can create adjustments.</p>}
        </div>
      )}

      {tab === "services" && <ServicesTab customerId={id} />}
    </div>
  );
}

async function LedgerTab({ customerId }: { customerId: string }) {
  const db = untyped(createSupabaseServerClient());
  const { data, error } = await db
    .from("ledger_entries")
    .select("id, created_at, entry_type, amount_cents, ledger_account, description")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return <p role="alert" className="text-sm text-danger">Could not load the ledger: {error.message}</p>;
  const rows = (data ?? []) as Row[];
  return (
    <Card><CardContent className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-2">Posted</th><th>Account</th><th>Description</th><th className="text-right">Debit</th><th className="p-2 text-right">Credit</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td className="p-4 text-neutral-600" colSpan={5}>No ledger entries.</td></tr>}
          {rows.map((r) => (
            <tr key={String(r.id)} className="border-t border-neutral-100">
              <td className="p-2">{formatDateTime(String(r.created_at))}</td><td>{String(r.ledger_account).replace(/_/g, " ")}</td><td>{String(r.description)}</td>
              <td className="text-right">{r.entry_type === "debit" ? formatCents(Number(r.amount_cents)) : ""}</td>
              <td className="p-2 text-right">{r.entry_type === "credit" ? formatCents(Number(r.amount_cents)) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-3 text-xs text-neutral-500">The ledger is append-only. Corrections are made with reversals, credit notes or adjustments.</p>
    </CardContent></Card>
  );
}

async function ServicesTab({ customerId }: { customerId: string }) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("subscriptions").select("id, status, start_date").eq("customer_id", customerId).limit(50);
  if (error) return <p role="alert" className="text-sm text-danger">Could not load services: {error.message}</p>;
  return (
    <Card><CardContent className="space-y-1 p-4 text-sm">
      {(data ?? []).length === 0 && <p className="text-neutral-600">No subscriptions.</p>}
      {(data ?? []).map((s) => <p key={s.id}>Subscription · {s.status} · from {formatDay(s.start_date)}</p>)}
    </CardContent></Card>
  );
}
