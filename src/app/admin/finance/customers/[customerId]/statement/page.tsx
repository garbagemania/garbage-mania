import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { PrintLetterhead, PrintButton } from "@/components/brand/print-kit";
import { formatCents, formatDay } from "@/lib/format";
import { FINANCE_READERS, fieldClass, labelClass, untyped } from "../../../_lib";

type Statement = {
  opening_balance_cents: number; closing_balance_cents: number; total_debits_cents: number; total_credits_cents: number;
  rows: { date: string; reference: string | null; description: string; debit_cents: number; credit_cents: number; running_balance_cents: number }[];
};
const iso = /^\d{4}-\d{2}-\d{2}$/;

export default async function StatementPage({ params, searchParams }: { params: { customerId: string }; searchParams: { from?: string; to?: string } }) {
  await requirePageRoles(FINANCE_READERS);
  const supabase = createSupabaseServerClient();
  const { data: customer } = await supabase.from("customers").select("id, display_name").eq("id", params.customerId).maybeSingle();
  if (!customer) notFound();

  const from = searchParams.from && iso.test(searchParams.from) ? searchParams.from : null;
  const to = searchParams.to && iso.test(searchParams.to) ? searchParams.to : null;
  const { data, error } = await untyped(supabase).rpc("get_account_statement", { p_customer_id: params.customerId, p_from: from, p_to: to });
  const s = data as Statement | null;
  const qs = new URLSearchParams({ type: "statement", customer: params.customerId, ...(from ? { from } : {}), ...(to ? { to } : {}) });

  return (
    <div className="space-y-6">
      <PrintLetterhead />
      <PageHeader title="Statement of account" description={`GARBAGE MANIA SERVICES LTD - ${customer.display_name}`} action={<div className="flex gap-2 print:hidden"><PrintButton /><Link href={`/admin/finance/export?${qs}`}><Button variant="outline">Download CSV</Button></Link></div>} />
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="from" className={labelClass}>From</label><input id="from" name="from" type="date" defaultValue={from ?? ""} className={fieldClass} /></div>
        <div><label htmlFor="to" className={labelClass}>To</label><input id="to" name="to" type="date" defaultValue={to ?? ""} className={fieldClass} /></div>
        <Button type="submit" variant="outline">Apply</Button>
      </form>
      {error && <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">Could not load the statement: {error.message}</p>}
      {s && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-2">Date</th><th>Reference</th><th>Description</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="p-2 text-right">Balance</th></tr></thead>
            <tbody>
              <tr className="border-t border-neutral-100 font-medium"><td className="p-2" colSpan={5}>Opening balance</td><td className="p-2 text-right">{formatCents(s.opening_balance_cents)}</td></tr>
              {s.rows.length === 0 && <tr><td className="p-4 text-neutral-600" colSpan={6}>No transactions in this period.</td></tr>}
              {s.rows.map((r, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="p-2">{formatDay(r.date)}</td><td>{r.reference ?? "—"}</td><td>{r.description}</td>
                  <td className="text-right">{r.debit_cents ? formatCents(r.debit_cents) : ""}</td><td className="text-right">{r.credit_cents ? formatCents(r.credit_cents) : ""}</td>
                  <td className="p-2 text-right">{formatCents(r.running_balance_cents)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-300 font-medium"><td className="p-2" colSpan={3}>Totals</td><td className="text-right">{formatCents(s.total_debits_cents)}</td><td className="text-right">{formatCents(s.total_credits_cents)}</td><td /></tr>
              <tr className="font-semibold"><td className="p-2" colSpan={5}>Closing balance</td><td className="p-2 text-right">{formatCents(s.closing_balance_cents)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
