import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/admin/page-kit";
import { formatCents, formatDay } from "@/lib/format";
import { getPortalContext } from "@/lib/portal/customer";
import { todayNairobi } from "@/lib/portal/dates";
import {
  EmptyState,
  Field,
  LoadError,
  NoCustomerAccount,
  SUBSCRIPTION_TONE,
  Status,
  label,
} from "@/components/portal/portal-ui";

export default async function SubscriptionPage() {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  const today = todayNairobi();

  const [subsRes, contractsRes, addressesRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, contract_id, service_address_id, service_plan_id, frequency, status, start_date, end_date")
      .eq("customer_id", customerId)
      .order("start_date", { ascending: false }),
    supabase
      .from("contracts")
      .select("id, contract_number, start_date, end_date, billing_terms, status")
      .eq("customer_id", customerId)
      .order("start_date", { ascending: false }),
    supabase.from("service_addresses").select("id, label").eq("customer_id", customerId),
  ]);

  const subs = subsRes.data ?? [];
  const contracts = contractsRes.data ?? [];
  const planIds = Array.from(new Set(subs.map((s) => s.service_plan_id)));

  const [plansRes, pricesRes] = await Promise.all([
    supabase.from("service_plans").select("id, name, code, waste_type, container_type").in("id", planIds),
    supabase
      .from("service_plan_prices")
      .select("service_plan_id, price_cents, currency, effective_from, effective_to")
      .in("service_plan_id", planIds)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false }),
  ]);

  const plans = new Map((plansRes.data ?? []).map((p) => [p.id, p]));
  const contractById = new Map(contracts.map((c) => [c.id, c]));
  const addressLabel = new Map((addressesRes.data ?? []).map((a) => [a.id, a.label]));

  // Newest price whose window covers today (rows are ordered newest-first).
  const currentPrice = new Map<string, { price_cents: number; currency: string }>();
  for (const pr of pricesRes.data ?? []) {
    if (currentPrice.has(pr.service_plan_id)) continue;
    if (pr.effective_to && pr.effective_to < today) continue;
    currentPrice.set(pr.service_plan_id, { price_cents: Number(pr.price_cents), currency: pr.currency });
  }

  const error =
    subsRes.error?.message ?? contractsRes.error?.message ?? addressesRes.error?.message ?? plansRes.error?.message ?? pricesRes.error?.message;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Service plan</h1>
        <p className="text-sm text-neutral-600">Your subscriptions and contracts with Garbage Mania.</p>
      </div>

      {error && <LoadError message={error} />}

      {!error && subs.length === 0 && <EmptyState>No active subscription</EmptyState>}

      <div className="space-y-4">
        {subs.map((s) => {
          const plan = plans.get(s.service_plan_id);
          const contract = contractById.get(s.contract_id);
          const price = currentPrice.get(s.service_plan_id);
          return (
            <Card key={s.id}>
              <CardHeader className="flex items-center justify-between gap-2">
                <CardTitle>{plan?.name ?? "Service plan"}</CardTitle>
                <Status value={s.status} tones={SUBSCRIPTION_TONE} />
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Service type">
                    {plan ? `${label(plan.waste_type)}${plan.container_type ? ` · ${plan.container_type}` : ""}` : "—"}
                  </Field>
                  <Field label="Frequency">{label(s.frequency)}</Field>
                  <Field label="Service address">{addressLabel.get(s.service_address_id) ?? "—"}</Field>
                  <Field label="Start date">{formatDay(s.start_date)}</Field>
                  <Field label="End date">{s.end_date ? formatDay(s.end_date) : "Ongoing"}</Field>
                  <Field label="Plan price">{price ? formatCents(price.price_cents, price.currency) : "Not available"}</Field>
                  <Field label="Contract">
                    {contract ? `${contract.contract_number} (${label(contract.status)})` : "—"}
                  </Field>
                  <Field label="Billing terms">{contract ? label(contract.billing_terms) : "—"}</Field>
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Contracts</h2>
        <DataTable
          rows={contractsRes.error ? null : contracts}
          error={contractsRes.error}
          emptyMessage="No contracts on record."
          columns={[
            { header: "Contract", cell: (c) => c.contract_number },
            { header: "Status", cell: (c) => <Status value={c.status} tones={SUBSCRIPTION_TONE} /> },
            { header: "Billing terms", cell: (c) => label(c.billing_terms) },
            { header: "Start", cell: (c) => formatDay(c.start_date) },
            { header: "End", cell: (c) => (c.end_date ? formatDay(c.end_date) : "Ongoing") },
          ]}
        />
      </section>
    </>
  );
}
