import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";
import { FINANCE_READERS, FINANCE_WRITERS, RANGES, Stat, fieldClass, labelClass, resolveRange, untyped } from "./_lib";

const LABELS: Record<string, string> = {
  today: "Today", week: "This week", month: "This month", prev_month: "Previous month", year: "Current year", custom: "Custom range",
};

type Summary = Record<string, number>;

export default async function FinanceDashboard({ searchParams }: { searchParams: { range?: string; from?: string; to?: string } }) {
  const user = await requirePageRoles(FINANCE_READERS);
  const range = resolveRange(searchParams.range, searchParams.from, searchParams.to);
  const db = untyped(createSupabaseServerClient());
  const { data, error } = await db.rpc("finance_summary", { p_from: range.from, p_to: range.to });
  const s = (data ?? {}) as Summary;
  const canWrite = !!user.role && FINANCE_WRITERS.includes(user.role);

  const empty =
    !error && data &&
    !s.invoiced_total_cents && !s.collected_total_cents && !s.pending_payments_count && !s.mpesa_exceptions_count;
  const money = (n: number | undefined) => formatCents(n ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description={`Garbage Mania Services Ltd - figures come live from the ledger. Period: ${range.from} to ${range.to}.`}
        action={canWrite ? (
          <div className="flex gap-2">
            <Link href="/admin/finance/invoices/new"><Button>New invoice</Button></Link>
            <Link href="/admin/finance/payments/new"><Button variant="outline">Record payment</Button></Link>
          </div>
        ) : undefined}
      />

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="range" className={labelClass}>Period</label>
          <select id="range" name="range" defaultValue={range.key} className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm">
            {RANGES.map((r) => <option key={r} value={r}>{LABELS[r]}</option>)}
          </select>
        </div>
        <div><label htmlFor="from" className={labelClass}>From (custom)</label><input id="from" name="from" type="date" defaultValue={range.key === "custom" ? range.from : ""} className={fieldClass} /></div>
        <div><label htmlFor="to" className={labelClass}>To (custom)</label><input id="to" name="to" type="date" defaultValue={range.key === "custom" ? range.to : ""} className={fieldClass} /></div>
        <Button type="submit" variant="outline">Apply</Button>
      </form>

      {error && <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">Could not load finance figures: {error.message}</p>}

      {empty && <p className="rounded-md border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-600">No financial transactions found.</p>}

      {!error && !empty && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total invoiced" value={money(s.invoiced_total_cents)} hint="All issued invoices" />
            <Stat label="Total collected" value={money(s.collected_total_cents)} hint="Verified payments" />
            <Stat label="Outstanding receivables" value={money(s.outstanding_cents)} />
            <Stat label="Overdue" value={money(s.overdue_cents)} hint={`${s.overdue_count ?? 0} invoice(s)`} />
            <Stat label="Invoiced in period" value={money(s.invoiced_range_cents)} hint={`${s.invoices_range_count ?? 0} invoice(s)`} />
            <Stat label="Collected in period" value={money(s.collected_range_cents)} hint={`${s.payments_range_count ?? 0} payment(s)`} />
            <Stat label="Pending cheque verification" value={s.pending_cheques_count ?? 0} hint={money(s.pending_cheques_cents)} />
            <Stat label="Unallocated payments" value={money(s.unallocated_cents)} hint={`${s.unallocated_count ?? 0} payment(s)`} />
            <Stat label="M-Pesa reconciliation exceptions" value={s.mpesa_exceptions_count ?? 0} />
            <Stat label="Payments awaiting verification" value={s.pending_payments_count ?? 0} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="text-brand-green-700" href="/admin/payments?status=pending">Verify pending payments</Link>
            <Link className="text-brand-green-700" href="/admin/finance/payments/unallocated">Unallocated payments</Link>
            <Link className="text-brand-green-700" href="/admin/finance/customers">Customer accounts</Link>
            <Link className="text-brand-green-700" href="/admin/finance/reports">Reports</Link>
          </div>
        </>
      )}
    </div>
  );
}
