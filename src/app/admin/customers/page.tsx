import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchParams {
  q?: string;
  type?: string;
  status?: string;
}

/**
 * Real customer list, querying public.customers directly through the
 * authenticated (RLS-scoped) Supabase client - never the service-role
 * client. Search/filter are plain GET query params so the page works
 * without client-side JavaScript.
 */
export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("customers")
    .select("id, customer_type, display_name, billing_email, billing_phone, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (searchParams.q) {
    query = query.ilike("display_name", `%${searchParams.q}%`);
  }
  if (searchParams.type === "individual" || searchParams.type === "corporate") {
    query = query.eq("customer_type", searchParams.type);
  }
  if (searchParams.status === "active" || searchParams.status === "suspended" || searchParams.status === "closed") {
    query = query.eq("status", searchParams.status);
  }

  const { data: customers, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Customers</h1>
          <p className="text-sm text-neutral-600">Individual and corporate accounts.</p>
        </div>
        <Link href="/admin/customers/new">
          <Button>New customer</Button>
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-neutral-600">
            Search by name
          </label>
          <Input id="q" name="q" defaultValue={searchParams.q ?? ""} placeholder="e.g. Jane Wanjiru" />
        </div>
        <div>
          <label htmlFor="type" className="mb-1 block text-xs font-medium text-neutral-600">
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue={searchParams.type ?? ""}
            className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
          >
            <option value="">All</option>
            <option value="individual">Individual</option>
            <option value="corporate">Corporate</option>
          </select>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-neutral-600">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {error && (
        <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          Could not load customers: {error.message}
        </p>
      )}

      {!error && customers && customers.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">
            {searchParams.q || searchParams.type || searchParams.status
              ? "No customers match this filter."
              : "No customer data yet. Create the first customer to get started."}
          </CardContent>
        </Card>
      )}

      {customers && customers.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link href={`/admin/customers/${customer.id}`} className="font-medium text-brand-green-700">
                      {customer.display_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 capitalize text-neutral-700">{customer.customer_type}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {customer.billing_email ?? customer.billing_phone ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      tone={
                        customer.status === "active"
                          ? "success"
                          : customer.status === "suspended"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {customer.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
