import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCustomer } from "../actions";

export default function NewCustomerPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">New customer</h1>

      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
        </CardHeader>
        <CardContent>
          {searchParams.error && (
            <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{searchParams.error}</p>
          )}
          <form action={createCustomer} className="space-y-4">
            <div>
              <label htmlFor="customerType" className="mb-1 block text-sm font-medium text-neutral-700">
                Customer type
              </label>
              <select
                id="customerType"
                name="customerType"
                required
                defaultValue="individual"
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
              <Input id="displayName" name="displayName" required placeholder="e.g. Jane Wanjiru, or Acme Ltd" />
            </div>
            <div>
              <label htmlFor="kraPin" className="mb-1 block text-sm font-medium text-neutral-700">
                KRA PIN <span className="text-neutral-400">(corporate, optional)</span>
              </label>
              <Input id="kraPin" name="kraPin" placeholder="P051234567X" />
            </div>
            <div>
              <label htmlFor="billingEmail" className="mb-1 block text-sm font-medium text-neutral-700">
                Billing email
              </label>
              <Input id="billingEmail" name="billingEmail" type="email" placeholder="billing@example.com" />
            </div>
            <div>
              <label htmlFor="billingPhone" className="mb-1 block text-sm font-medium text-neutral-700">
                Billing phone
              </label>
              <Input id="billingPhone" name="billingPhone" placeholder="0712345678" />
            </div>
            <div>
              <label htmlFor="notes" className="mb-1 block text-sm font-medium text-neutral-700">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" className="w-full">
              Create customer
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
