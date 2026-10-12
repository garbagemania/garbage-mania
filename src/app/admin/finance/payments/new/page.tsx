import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { FINANCE_WRITERS, Notice, fieldClass, labelClass, todayNairobi } from "../../_lib";
import { recordPayment } from "../../actions";

export default async function RecordPaymentPage({ searchParams }: { searchParams: { error?: string; customer?: string } }) {
  await requirePageRoles(FINANCE_WRITERS);
  const supabase = createSupabaseServerClient();
  const { data: customers } = await supabase.from("customers").select("id, display_name").order("display_name").limit(500);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record payment"
        description="A recorded payment is pending until finance verifies it. Only verified payments reach the ledger or reduce a balance."
      />
      <Notice error={searchParams.error} />
      <form action={recordPayment} encType="multipart/form-data" className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="customerId" className={labelClass}>Customer</label>
          <select id="customerId" name="customerId" required defaultValue={searchParams.customer ?? ""} className={fieldClass}>
            <option value="" disabled>Select a customer…</option>
            {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="method" className={labelClass}>Method</label>
          <select id="method" name="method" required defaultValue="" className={fieldClass}>
            <option value="" disabled>Select…</option>
            <option value="mpesa">M-Pesa (manual entry)</option>
            <option value="cheque">Cheque</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div><label htmlFor="amount" className={labelClass}>Amount (KES)</label><input id="amount" name="amount" required inputMode="decimal" className={fieldClass} /></div>
        <div><label htmlFor="receivedOn" className={labelClass}>Date received</label><input id="receivedOn" name="receivedOn" type="date" required defaultValue={todayNairobi()} className={fieldClass} /></div>
        <div><label htmlFor="reference" className={labelClass}>External reference (M-Pesa code, bank ref)</label><input id="reference" name="reference" maxLength={100} className={fieldClass} /></div>

        <fieldset className="grid gap-4 rounded-md border border-neutral-200 p-3 sm:col-span-2 sm:grid-cols-3">
          <legend className="px-1 text-xs font-medium text-neutral-600">Cheque details (cheque payments only)</legend>
          <div><label htmlFor="chequeNumber" className={labelClass}>Cheque number</label><input id="chequeNumber" name="chequeNumber" maxLength={50} className={fieldClass} /></div>
          <div><label htmlFor="bankName" className={labelClass}>Bank</label><input id="bankName" name="bankName" maxLength={100} className={fieldClass} /></div>
          <div><label htmlFor="chequeDate" className={labelClass}>Cheque date</label><input id="chequeDate" name="chequeDate" type="date" className={fieldClass} /></div>
        </fieldset>

        <div className="sm:col-span-2">
          <label htmlFor="document" className={labelClass}>Supporting document / cheque image (JPEG, PNG, WebP or PDF, max 10 MB)</label>
          <input id="document" name="document" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm" />
        </div>
        <div className="sm:col-span-2"><label htmlFor="notes" className={labelClass}>Notes</label><input id="notes" name="notes" maxLength={1000} className={fieldClass} /></div>
        <div className="sm:col-span-2"><Button type="submit">Record payment</Button></div>
      </form>
    </div>
  );
}
