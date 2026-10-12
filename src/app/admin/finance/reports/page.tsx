import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FINANCE_READERS, fieldClass, labelClass, todayNairobi } from "../_lib";

const REPORTS = [
  ["revenue", "Revenue report", "Date, customer, invoice, service, subtotal, VAT and total per invoice line."],
  ["payments", "Payments report", "Date, customer, method, reference, amount and status."],
  ["receivables", "Outstanding receivables", "Open invoices with paid, outstanding and days overdue (as of today)."],
  ["vat", "VAT report", "Taxable amount, VAT and total per invoice."],
  ["mpesa", "M-Pesa reconciliation", "M-Pesa receipts matched to internal payments."],
  ["cheques", "Cheque report", "Cheque number, bank, customer, amount, status and dates."],
] as const;

export default async function ReportsPage() {
  await requirePageRoles(FINANCE_READERS);
  const today = todayNairobi();
  const monthStart = `${today.slice(0, 8)}01`;
  return (
    <div className="space-y-6">
      <PageHeader title="Finance reports" description="Generated live from the database and downloaded as CSV (opens in Excel). Customer statements are on each customer's account." />
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map(([type, title, desc]) => (
          <Card key={type}>
            <CardContent className="space-y-3 p-4">
              <div><h2 className="font-semibold text-neutral-900">{title}</h2><p className="text-sm text-neutral-600">{desc}</p></div>
              <form action="/admin/finance/export" method="GET" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="type" value={type} />
                {type !== "receivables" && (
                  <>
                    <div><label htmlFor={`${type}-from`} className={labelClass}>From</label><input id={`${type}-from`} name="from" type="date" defaultValue={monthStart} className={fieldClass} /></div>
                    <div><label htmlFor={`${type}-to`} className={labelClass}>To</label><input id={`${type}-to`} name="to" type="date" defaultValue={today} className={fieldClass} /></div>
                  </>
                )}
                <Button type="submit" variant="outline">Download CSV</Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
