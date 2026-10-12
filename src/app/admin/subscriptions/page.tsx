import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SearchParams {
  status?: string;
}

export default async function SubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("subscriptions")
    .select(
      "id, status, frequency, start_date, customers ( display_name ), service_plans ( name ), service_addresses ( label )",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (["pending", "active", "paused", "cancelled"].includes(searchParams.status ?? "")) {
    query = query.eq("status", searchParams.status as "pending" | "active" | "paused" | "cancelled");
  }

  const { data: subscriptions, error } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Subscriptions</h1>
        <p className="text-sm text-neutral-600">
          Create a subscription from a customer&apos;s page, or view/manage existing ones here.
        </p>
      </div>

      <form method="GET" className="flex items-end gap-3">
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
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </form>

      {error && (
        <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          Could not load subscriptions: {error.message}
        </p>
      )}

      {!error && subscriptions && subscriptions.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">
            No subscriptions yet — create one from a customer&apos;s page.
          </CardContent>
        </Card>
      )}

      {subscriptions && subscriptions.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Address</th>
                <th className="px-4 py-2">Frequency</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2 text-neutral-700">{sub.customers?.display_name}</td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/subscriptions/${sub.id}`} className="font-medium text-brand-green-700">
                      {sub.service_plans?.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{sub.service_addresses?.label}</td>
                  <td className="px-4 py-2 capitalize text-neutral-700">{sub.frequency}</td>
                  <td className="px-4 py-2">
                    <Badge
                      tone={sub.status === "active" ? "success" : sub.status === "cancelled" ? "neutral" : "warning"}
                    >
                      {sub.status}
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
