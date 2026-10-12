import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ServicePlansPage() {
  const supabase = createSupabaseServerClient();
  const { data: plans, error } = await supabase
    .from("service_plans")
    .select("id, code, name, waste_type, default_frequency, is_active")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Service plans</h1>
          <p className="text-sm text-neutral-600">Catalog of standard offerings and their pricing.</p>
        </div>
        <Link href="/admin/service-plans/new">
          <Button>New plan</Button>
        </Link>
      </div>

      {error && (
        <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          Could not load service plans: {error.message}
        </p>
      )}

      {!error && plans && plans.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">
            No service plans yet. Create the first one to start offering subscriptions.
          </CardContent>
        </Card>
      )}

      {plans && plans.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Waste type</th>
                <th className="px-4 py-2">Frequency</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2 font-mono text-xs text-neutral-600">{plan.code}</td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/service-plans/${plan.id}`} className="font-medium text-brand-green-700">
                      {plan.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 capitalize text-neutral-700">{plan.waste_type}</td>
                  <td className="px-4 py-2 capitalize text-neutral-700">{plan.default_frequency}</td>
                  <td className="px-4 py-2">
                    <Badge tone={plan.is_active ? "success" : "neutral"}>
                      {plan.is_active ? "active" : "inactive"}
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
