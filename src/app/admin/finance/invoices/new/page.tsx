import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { FINANCE_WRITERS, Notice, fieldClass, labelClass, todayNairobi, untyped } from "../../_lib";
import { saveInvoice } from "../../actions";

export default async function NewInvoicePage({ searchParams }: { searchParams: { error?: string; customer?: string } }) {
  await requirePageRoles(FINANCE_WRITERS);
  const supabase = createSupabaseServerClient();
  const db = untyped(supabase);

  const [{ data: customers }, { data: plans }, { data: setting }] = await Promise.all([
    supabase.from("customers").select("id, display_name").eq("status", "active").eq("approval_status", "approved").order("display_name").limit(500),
    supabase.from("service_plans").select("id, name").eq("is_active", true).order("name"),
    db.from("finance_settings").select("value").eq("key", "default_vat_rate_bp").maybeSingle(),
  ]);
  const defaultVat = setting?.value ? `${Number(setting.value) / 100}%` : null;
  const today = todayNairobi();

  return (
    <div className="space-y-6">
      <PageHeader title="New invoice" description="Save as a draft to review the calculated totals, or issue immediately. Totals and VAT are always computed by the server." />
      <Notice error={searchParams.error} />
      <form action={saveInvoice} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="customerId" className={labelClass}>Customer</label>
            <select id="customerId" name="customerId" required defaultValue={searchParams.customer ?? ""} className={fieldClass}>
              <option value="" disabled>Select a customer…</option>
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </div>
          <div><label htmlFor="issueDate" className={labelClass}>Invoice date</label><input id="issueDate" name="issueDate" type="date" required defaultValue={today} className={fieldClass} /></div>
          <div><label htmlFor="dueDate" className={labelClass}>Due date</label><input id="dueDate" name="dueDate" type="date" required className={fieldClass} /></div>
          <div><label htmlFor="periodStart" className={labelClass}>Billing period from</label><input id="periodStart" name="periodStart" type="date" className={fieldClass} /></div>
          <div><label htmlFor="periodEnd" className={labelClass}>Billing period to</label><input id="periodEnd" name="periodEnd" type="date" className={fieldClass} /></div>
          <div className="sm:col-span-2 lg:col-span-3"><label htmlFor="notes" className={labelClass}>Notes</label><input id="notes" name="notes" maxLength={1000} className={fieldClass} /></div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr><th className="p-2">Service (optional)</th><th className="p-2">Description</th><th className="p-2">Qty</th><th className="p-2">Unit price (KES)</th><th className="p-2">VAT %</th></tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="p-2">
                    <select name={`plan_${i}`} defaultValue="" className={fieldClass} aria-label={`Line ${i + 1} service`}>
                      <option value="">—</option>
                      {(plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><input name={`desc_${i}`} maxLength={300} className={fieldClass} aria-label={`Line ${i + 1} description`} /></td>
                  <td className="w-24 p-2"><input name={`qty_${i}`} inputMode="decimal" placeholder="1" className={fieldClass} aria-label={`Line ${i + 1} quantity`} /></td>
                  <td className="w-40 p-2"><input name={`price_${i}`} inputMode="decimal" placeholder="from service price" className={fieldClass} aria-label={`Line ${i + 1} unit price`} /></td>
                  <td className="w-24 p-2"><input name={`vat_${i}`} inputMode="decimal" placeholder={defaultVat ?? "0"} className={fieldClass} aria-label={`Line ${i + 1} VAT percent`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">
          Leave unit price blank to use the selected service&apos;s current configured price. Blank rows are ignored.{" "}
          {defaultVat ? `Blank VAT uses the configured default of ${defaultVat}.` : "No default VAT rate is configured, so a blank VAT % means 0% - enter the rate per line."}
        </p>
        <div className="flex gap-3">
          <Button type="submit" name="intent" value="draft" variant="outline">Save as draft</Button>
          <Button type="submit" name="intent" value="issue">Issue invoice</Button>
        </div>
      </form>
    </div>
  );
}
