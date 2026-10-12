import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateCustomer } from "../../actions";

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, customer_type, display_name, kra_pin, billing_email, billing_phone, notes")
    .eq("id", params.id)
    .maybeSingle();

  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Edit customer</h1>

      <Card>
        <CardHeader>
          <CardTitle>{customer.display_name}</CardTitle>
        </CardHeader>
        <CardContent>
          {searchParams.error && (
            <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{searchParams.error}</p>
          )}
          <form action={updateCustomer.bind(null, customer.id)} className="space-y-4">
            <div>
              <label htmlFor="customerType" className="mb-1 block text-sm font-medium text-neutral-700">
                Customer type
              </label>
              <select
                id="customerType"
                name="customerType"
                required
                defaultValue={customer.customer_type}
                className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
              >
                <option value="individual">Individual</option>
                <option value="corporate">Corporate</option>
              </select>
            </div>
            <div>
              <label htmlFor="displayName" className="mb-1 block text-sm font-medium text-neutral-700">
                Name
              </label>
              <Input id="displayName" name="displayName" required defaultValue={customer.display_name} />
            </div>
            <div>
              <label htmlFor="kraPin" className="mb-1 block text-sm font-medium text-neutral-700">
                KRA PIN
              </label>
              <Input id="kraPin" name="kraPin" defaultValue={customer.kra_pin ?? ""} />
            </div>
            <div>
              <label htmlFor="billingEmail" className="mb-1 block text-sm font-medium text-neutral-700">
                Billing email
              </label>
              <Input id="billingEmail" name="billingEmail" type="email" defaultValue={customer.billing_email ?? ""} />
            </div>
            <div>
              <label htmlFor="billingPhone" className="mb-1 block text-sm font-medium text-neutral-700">
                Billing phone
              </label>
              <Input id="billingPhone" name="billingPhone" defaultValue={customer.billing_phone ?? ""} />
            </div>
            <div>
              <label htmlFor="notes" className="mb-1 block text-sm font-medium text-neutral-700">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={customer.notes ?? ""}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" className="w-full">
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
