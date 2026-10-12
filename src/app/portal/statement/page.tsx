import { Button } from "@/components/ui/button";
import { PrintLetterhead, PrintButton } from "@/components/brand/print-kit";
import { Input } from "@/components/ui/input";
import { formatCents, formatDay } from "@/lib/format";
import { getPortalContext } from "@/lib/portal/customer";
import { buildStatement, loadCustomerFinancials } from "@/lib/portal/finance";
import { LoadError, NoCustomerAccount } from "@/components/portal/portal-ui";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function StatementPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  const from = searchParams.from && DATE.test(searchParams.from) ? searchParams.from : undefined;
  const to = searchParams.to && DATE.test(searchParams.to) ? searchParams.to : undefined;

  const { data: fin, error } = await loadCustomerFinancials(supabase);

  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Statement of account</h1>
      <p className="text-sm text-neutral-600">Invoices raised and payments applied to your account.</p>
    </div>
  );

  if (error || !fin) {
    return (
      <>
        {header}
        <LoadError message={error ?? "No data returned."} />
      </>
    );
  }

  const statement = buildStatement(fin, from, to);
  const currency = fin.invoices[0]?.currency ?? "KES";

  return (
    <>
      <PrintLetterhead />
      {header}
      <div className="print:hidden"><PrintButton /></div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-neutral-600">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-neutral-600">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        {(from || to) && (
          <a href="/portal/statement" className="pb-2 text-sm text-brand-green-600 hover:underline">
            Clear
          </a>
        )}
      </form>

      <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
              <th className="px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100 bg-neutral-50 font-medium">
              <td className="px-4 py-2">{from ? formatDay(from) : "—"}</td>
              <td className="px-4 py-2">Opening balance</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right tabular-nums">{formatCents(statement.openingCents, currency)}</td>
            </tr>
            {statement.lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  No transactions for this period.
                </td>
              </tr>
            )}
            {statement.lines.map((l) => (
              <tr key={l.key} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="whitespace-nowrap px-4 py-2">{formatDay(l.date)}</td>
                <td className="px-4 py-2 text-neutral-700">{l.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.debit_cents ? formatCents(l.debit_cents, currency) : ""}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.credit_cents ? formatCents(l.credit_cents, currency) : ""}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCents(l.balance_cents, currency)}</td>
              </tr>
            ))}
            <tr className="bg-neutral-50 font-semibold">
              <td className="px-4 py-2">{to ? formatDay(to) : "—"}</td>
              <td className="px-4 py-2">Closing balance</td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-right tabular-nums">{formatCents(statement.closingCents, currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {statement.unappliedPaymentsCents > 0 && (
        <p className="rounded-md bg-brand-yellow-50 px-4 py-3 text-sm text-neutral-800">
          You have {formatCents(statement.unappliedPaymentsCents, currency)} in confirmed payments not yet applied to an
          invoice. It is not included in the balance above until it is allocated.
        </p>
      )}
    </>
  );
}
