import { todayNairobi } from "@/lib/portal/dates";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createContract, createSubscription } from "../actions";

interface SearchParams {
  customerId?: string;
  q?: string;
  error?: string;
}

export default async function NewSubscriptionPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createSupabaseServerClient();

  if (!searchParams.customerId) {
    const { data: matches } = searchParams.q
      ? await supabase
          .from("customers")
          .select("id, display_name, customer_type")
          .ilike("display_name", `%${searchParams.q}%`)
          .limit(10)
      : { data: null };

    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">New subscription</h1>
        <Card>
          <CardHeader>
            <CardTitle>Find the customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form method="GET" className="flex gap-2">
              <Input name="q" defaultValue={searchParams.q ?? ""} placeholder="Search customers by name" />
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
            {matches && matches.length > 0 && (
              <ul className="divide-y divide-neutral-100">
                {matches.map((c) => (
                  <li key={c.id} className="py-2">
                    <Link
                      href={`/admin/subscriptions/new?customerId=${c.id}`}
                      className="font-medium text-brand-green-700"
                    >
                      {c.display_name}
                    </Link>{" "}
                    <span className="text-xs capitalize text-neutral-500">({c.customer_type})</span>
                  </li>
                ))}
              </ul>
            )}
            {matches && matches.length === 0 && (
              <p className="text-sm text-neutral-500">No customers match &ldquo;{searchParams.q}&rdquo;.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const customerId = searchParams.customerId;
  const [{ data: customer }, { data: serviceAddresses }, { data: plans }, { data: contracts }] = await Promise.all([
    supabase.from("customers").select("id, display_name").eq("id", customerId).maybeSingle(),
    supabase
      .from("service_addresses")
      .select("id, label")
      .eq("customer_id", customerId)
      .eq("status", "active"),
    supabase.from("service_plans").select("id, name, default_frequency").eq("is_active", true),
    supabase
      .from("contracts")
      .select("id, contract_number, status")
      .eq("customer_id", customerId)
      .eq("status", "active"),
  ]);

  if (!customer) {
    return <p className="text-sm text-danger">Customer not found.</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">New subscription</h1>
      <p className="text-sm text-neutral-600">
        For{" "}
        <Link href={`/admin/customers/${customer.id}`} className="font-medium text-brand-green-700">
          {customer.display_name}
        </Link>
      </p>

      {searchParams.error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{searchParams.error}</p>
      )}

      {(!serviceAddresses || serviceAddresses.length === 0) && (
        <p className="rounded-md border border-brand-yellow-200 bg-brand-yellow-50 px-4 py-3 text-sm text-neutral-700">
          This customer has no active service address yet. Add a property and service address on their{" "}
          <Link href={`/admin/customers/${customer.id}`} className="font-medium text-brand-green-700">
            customer page
          </Link>{" "}
          first.
        </p>
      )}

      {(!plans || plans.length === 0) && (
        <p className="rounded-md border border-brand-yellow-200 bg-brand-yellow-50 px-4 py-3 text-sm text-neutral-700">
          No active service plans exist yet. <Link href="/admin/service-plans/new" className="font-medium text-brand-green-700">Create one</Link> first.
        </p>
      )}

      {(!contracts || contracts.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Create a contract first</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-neutral-600">
              This customer has no active contract. A subscription always belongs to a contract.
            </p>
            <form action={createContract.bind(null, customer.id)} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Billing terms</label>
                <select
                  name="billingTerms"
                  required
                  defaultValue="net_30"
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  <option value="prepaid">Prepaid</option>
                  <option value="net_15">Net 15</option>
                  <option value="net_30">Net 30</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Start date</label>
                <Input name="startDate" type="date" required defaultValue={todayNairobi()} />
              </div>
              <Button type="submit">Create contract</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {contracts && contracts.length > 0 && serviceAddresses && serviceAddresses.length > 0 && plans && plans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription details</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createSubscription.bind(null, customer.id)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Contract</label>
                <select
                  name="contractId"
                  required
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contract_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Service address</label>
                <select
                  name="serviceAddressId"
                  required
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  {serviceAddresses.map((sa) => (
                    <option key={sa.id} value={sa.id}>
                      {sa.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Service plan</label>
                <select
                  name="servicePlanId"
                  required
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Frequency</label>
                <select
                  name="frequency"
                  required
                  defaultValue="weekly"
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="on_demand">On demand</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Start date</label>
                <Input name="startDate" type="date" required defaultValue={todayNairobi()} />
              </div>
              <Button type="submit" className="w-full">
                Create subscription
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
