import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCents, formatDay } from "@/lib/format";
import { getPortalContext } from "@/lib/portal/customer";
import { loadCustomerFinancials } from "@/lib/portal/finance";
import { todayNairobi } from "@/lib/portal/dates";
import {
  COLLECTION_TONE,
  INVOICE_TONE,
  PAYMENT_TONE,
  LoadError,
  NoCustomerAccount,
  StatCard,
  Status,
  label,
} from "@/components/portal/portal-ui";

export default async function PortalDashboardPage() {
  const { supabase, user, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  const today = todayNairobi();

  const [customerRes, financials, addressesRes, subsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("display_name, customer_type, status")
      .eq("id", customerId)
      .maybeSingle(),
    loadCustomerFinancials(supabase),
    supabase.from("service_addresses").select("id, label").eq("customer_id", customerId),
    supabase
      .from("subscriptions")
      .select("id, service_plan_id, service_address_id, frequency, status, start_date")
      .eq("customer_id", customerId)
      .eq("status", "active")
      .order("start_date", { ascending: false }),
  ]);

  const addresses = addressesRes.data ?? [];
  const addressIds = addresses.map((a) => a.id);
  const addressLabel = new Map(addresses.map((a) => [a.id, a.label]));
  const activeSubs = subsRes.data ?? [];

  const planIds = Array.from(new Set(activeSubs.map((s) => s.service_plan_id)));
  const [plansRes, upcomingRes, recentRes] = await Promise.all([
    supabase.from("service_plans").select("id, name").in("id", planIds),
    supabase
      .from("collections")
      .select("id, scheduled_date, status, service_address_id")
      .in("service_address_id", addressIds)
      .in("status", ["scheduled", "assigned", "in_progress"])
      .gte("scheduled_date", today)
      .order("scheduled_date", { ascending: true })
      .limit(1),
    supabase
      .from("collections")
      .select("id, scheduled_date, status, completed_at, service_address_id")
      .in("service_address_id", addressIds)
      .in("status", ["completed", "failed"])
      .order("scheduled_date", { ascending: false })
      .limit(1),
  ]);

  const planName = new Map((plansRes.data ?? []).map((p) => [p.id, p.name]));
  const nextCollection = upcomingRes.data?.[0] ?? null;
  const recentCollection = recentRes.data?.[0] ?? null;

  const fin = financials.data;
  const openInvoices = (fin?.invoices ?? []).filter((i) => i.outstanding_cents > 0 && i.status !== "paid");
  const recentPayment = fin?.payments[0] ?? null; // RPC returns newest first

  const customer = customerRes.data;
  const displayName = customer?.display_name ?? user.fullName ?? "Customer";
  const firstSub = activeSubs[0] ?? null;

  const queryError =
    customerRes.error?.message ??
    financials.error ??
    addressesRes.error?.message ??
    subsRes.error?.message ??
    plansRes.error?.message ??
    upcomingRes.error?.message ??
    recentRes.error?.message ??
    null;

  return (
    <>
      <div>
        <p className="text-sm text-neutral-500">Welcome back</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900 sm:text-3xl">{displayName}</h1>
        {customer && (
          <p className="mt-1 text-sm text-neutral-600">
            {label(customer.customer_type)} account · {label(customer.status)}
          </p>
        )}
      </div>

      {queryError && <LoadError message={queryError} />}

      {addresses.length === 0 && !addressesRes.error && (
        <Card className="border-brand-yellow-300 bg-brand-yellow-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-800">
              You haven&apos;t registered a collection address yet.
            </p>
            <Link href="/portal/onboarding">
              <Button variant="secondary">Complete registration</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Account balance"
          href="/portal/billing"
          value={fin ? formatCents(fin.outstandingCents) : "—"}
          hint={fin ? (fin.outstandingCents > 0 ? "Amount currently owed" : "Nothing owed") : "Unavailable"}
        />
        <StatCard
          label="Active subscription"
          href="/portal/subscription"
          value={firstSub ? (planName.get(firstSub.service_plan_id) ?? "Service plan") : "No active subscription"}
          hint={
            firstSub
              ? `${label(firstSub.frequency)} · ${addressLabel.get(firstSub.service_address_id) ?? "Service address"}${
                  activeSubs.length > 1 ? ` (+${activeSubs.length - 1} more)` : ""
                }`
              : undefined
          }
        />
        <StatCard
          label="Next collection"
          href="/portal/collections"
          value={nextCollection ? formatDay(nextCollection.scheduled_date) : "No upcoming collections"}
          hint={
            nextCollection ? (
              <span className="inline-flex items-center gap-2">
                <Status value={nextCollection.status} tones={COLLECTION_TONE} />
                {addressLabel.get(nextCollection.service_address_id)}
              </span>
            ) : undefined
          }
        />
        <StatCard
          label="Recent payment"
          href="/portal/billing"
          value={recentPayment ? formatCents(Number(recentPayment.amount_cents), recentPayment.currency) : "No payments recorded"}
          hint={
            recentPayment ? (
              <span className="inline-flex items-center gap-2">
                <Status value={recentPayment.status} tones={PAYMENT_TONE} />
                {formatDay(recentPayment.received_at)}
              </span>
            ) : undefined
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent collection</CardTitle>
          </CardHeader>
          <CardContent>
            {recentCollection ? (
              <div className="space-y-1 text-sm">
                <p className="text-lg font-semibold text-neutral-900">{formatDay(recentCollection.scheduled_date)}</p>
                <p className="flex items-center gap-2">
                  <Status value={recentCollection.status} tones={COLLECTION_TONE} />
                  <span className="text-neutral-600">{addressLabel.get(recentCollection.service_address_id)}</span>
                </p>
                <Link href="/portal/collections" className="inline-block pt-2 text-brand-green-600 hover:underline">
                  View all collections
                </Link>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No collection records yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outstanding invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {openInvoices.length === 0 ? (
              <p className="text-sm text-neutral-500">No outstanding invoices</p>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {openInvoices.slice(0, 4).map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-medium text-neutral-900">{inv.invoice_number}</span>
                      <span className="block text-xs text-neutral-500">Due {formatDay(inv.due_date)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Status value={inv.status} tones={INVOICE_TONE} />
                      <span className="tabular-nums">{formatCents(inv.outstanding_cents, inv.currency)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {openInvoices.length > 4 && (
              <Link href="/portal/billing" className="mt-2 inline-block text-sm text-brand-green-600 hover:underline">
                View all {openInvoices.length} outstanding invoices
              </Link>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-neutral-900">Need something?</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Request an extra collection, check your addresses or review your statement.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/portal/requests">
              <Button>Request a collection</Button>
            </Link>
            <Link href="/portal/addresses">
              <Button variant="outline">Service addresses</Button>
            </Link>
            <Link href="/portal/statement">
              <Button variant="outline">Statement</Button>
            </Link>
          </div>
        </Card>
      </section>
    </>
  );
}
