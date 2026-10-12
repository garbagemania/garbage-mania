import { todayNairobi } from "@/lib/portal/dates";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setServicePlanActive, addServicePlanPrice } from "../actions";

const CAN_MANAGE = ["super_admin", "admin"];

function formatKes(cents: number) {
  return `KES ${(cents / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

export default async function ServicePlanDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireAuthenticatedUser();
  const supabase = createSupabaseServerClient();

  const { data: plan } = await supabase
    .from("service_plans")
    .select("id, code, name, waste_type, container_type, default_frequency, is_active")
    .eq("id", params.id)
    .maybeSingle();

  if (!plan) notFound();

  const { data: prices } = await supabase
    .from("service_plan_prices")
    .select("id, price_cents, effective_from, effective_to")
    .eq("service_plan_id", plan.id)
    .order("effective_from", { ascending: false });

  const currentPrice = prices?.find((p) => p.effective_to === null) ?? null;
  const canManage = user.role ? CAN_MANAGE.includes(user.role) : false;

  return (
    <div className="space-y-6">
      {searchParams.error && (
        <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">{searchParams.error}</p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{plan.name}</CardTitle>
            <p className="mt-1 font-mono text-xs text-neutral-500">{plan.code}</p>
          </div>
          <Badge tone={plan.is_active ? "success" : "neutral"}>{plan.is_active ? "active" : "inactive"}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-neutral-500">Waste type</p>
            <p className="capitalize text-neutral-900">{plan.waste_type}</p>
          </div>
          <div>
            <p className="text-neutral-500">Default frequency</p>
            <p className="capitalize text-neutral-900">{plan.default_frequency}</p>
          </div>
          {plan.container_type && (
            <div>
              <p className="text-neutral-500">Container type</p>
              <p className="text-neutral-900">{plan.container_type}</p>
            </div>
          )}
          <div>
            <p className="text-neutral-500">Current price</p>
            <p className="text-neutral-900">{currentPrice ? formatKes(currentPrice.price_cents) : "Not set"}</p>
          </div>
        </CardContent>
        {canManage && (
          <CardContent className="border-t border-neutral-100 pt-4">
            <form action={setServicePlanActive.bind(null, plan.id, !plan.is_active)}>
              <Button type="submit" variant="outline" size="sm">
                {plan.is_active ? "Deactivate plan" : "Activate plan"}
              </Button>
            </form>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {prices && prices.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-1">Price</th>
                  <th className="py-1">Effective from</th>
                  <th className="py-1">Effective to</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((price) => (
                  <tr key={price.id} className="border-t border-neutral-100">
                    <td className="py-1.5">{formatKes(price.price_cents)}</td>
                    <td className="py-1.5 text-neutral-600">{price.effective_from}</td>
                    <td className="py-1.5 text-neutral-600">
                      {price.effective_to ?? <Badge tone="success">current</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-neutral-500">No pricing set yet.</p>
          )}

          {canManage && (
            <details className="rounded-md border border-neutral-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-green-700">
                Set a new price
              </summary>
              <form action={addServicePlanPrice.bind(null, plan.id)} className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Price (KES)</label>
                  <Input name="priceKes" type="number" min={0} step="0.01" required className="w-32" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Effective from</label>
                  <Input
                    name="effectiveFrom"
                    type="date"
                    required
                    defaultValue={todayNairobi()}
                  />
                </div>
                <Button type="submit" size="sm">
                  Save new price
                </Button>
              </form>
              <p className="mt-2 text-xs text-neutral-500">
                This closes the current price and opens the new one atomically — the current price is never
                edited or deleted, only superseded, so past invoices remain traceable to the price actually in
                effect when they were issued.
              </p>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
