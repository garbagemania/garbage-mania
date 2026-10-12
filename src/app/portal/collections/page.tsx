import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/page-kit";
import { formatDateTime, formatDay } from "@/lib/format";
import { getPortalContext } from "@/lib/portal/customer";
import { todayNairobi } from "@/lib/portal/dates";
import { COLLECTION_TONE, LoadError, NoCustomerAccount, Status, label } from "@/components/portal/portal-ui";
import type { CollectionStatus } from "@/types/database";

const STATUSES: CollectionStatus[] = [
  "scheduled",
  "assigned",
  "in_progress",
  "completed",
  "failed",
  "rescheduled",
  "cancelled",
];
const ACTIVE: CollectionStatus[] = ["scheduled", "assigned", "in_progress"];

interface Row {
  id: string;
  scheduled_date: string;
  status: CollectionStatus;
  service: string;
  address: string;
  arrived_at: string | null;
  completed_at: string | null;
  weight_kg: number | null;
  proofAt: string | null;
  reason: string | null;
  notes: string | null;
}

export default async function CollectionsPage({ searchParams }: { searchParams: { status?: string } }) {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  const today = todayNairobi();
  const statusFilter = STATUSES.find((s) => s === searchParams.status);

  const [addressesRes, subsRes, requestsRes] = await Promise.all([
    supabase.from("service_addresses").select("id, label").eq("customer_id", customerId),
    supabase.from("subscriptions").select("id, service_plan_id").eq("customer_id", customerId),
    supabase.from("waste_collection_requests").select("id, waste_type, notes").eq("customer_id", customerId),
  ]);

  const addresses = addressesRes.data ?? [];
  const addressIds = addresses.map((a) => a.id);
  const planIds = Array.from(new Set((subsRes.data ?? []).map((s) => s.service_plan_id)));

  let collectionsQuery = supabase
    .from("collections")
    .select(
      "id, scheduled_date, status, service_address_id, subscription_id, collection_request_id, arrived_at, completed_at, weight_kg",
    )
    .in("service_address_id", addressIds)
    .order("scheduled_date", { ascending: false })
    .limit(200);
  if (statusFilter) collectionsQuery = collectionsQuery.eq("status", statusFilter);

  const [collectionsRes, plansRes] = await Promise.all([
    collectionsQuery,
    supabase.from("service_plans").select("id, name").in("id", planIds),
  ]);

  const collections = collectionsRes.data ?? [];
  const collectionIds = collections.map((c) => c.id);

  const [evidenceRes, failedRes] = await Promise.all([
    supabase.from("collection_evidence").select("id, collection_id, captured_at").in("collection_id", collectionIds),
    supabase.from("failed_collections").select("collection_id, reason_code, notes").in("collection_id", collectionIds),
  ]);

  const addressLabel = new Map(addresses.map((a) => [a.id, a.label]));
  const planName = new Map((plansRes.data ?? []).map((p) => [p.id, p.name]));
  const subPlan = new Map((subsRes.data ?? []).map((s) => [s.id, planName.get(s.service_plan_id)]));
  const requestById = new Map((requestsRes.data ?? []).map((r) => [r.id, r]));
  const proof = new Map<string, string>();
  for (const e of evidenceRes.data ?? []) {
    const prev = proof.get(e.collection_id);
    if (!prev || e.captured_at > prev) proof.set(e.collection_id, e.captured_at);
  }
  const failed = new Map((failedRes.data ?? []).map((f) => [f.collection_id, f]));

  const rows: Row[] = collections.map((c) => {
    const req = c.collection_request_id ? requestById.get(c.collection_request_id) : undefined;
    const f = failed.get(c.id);
    return {
      id: c.id,
      scheduled_date: c.scheduled_date,
      status: c.status,
      service: c.subscription_id
        ? (subPlan.get(c.subscription_id) ?? "Scheduled service")
        : `Requested collection${req ? ` · ${label(req.waste_type)}` : ""}`,
      address: addressLabel.get(c.service_address_id) ?? "—",
      arrived_at: c.arrived_at,
      completed_at: c.completed_at,
      weight_kg: c.weight_kg === null ? null : Number(c.weight_kg),
      proofAt: proof.get(c.id) ?? null,
      reason: f ? label(f.reason_code) : null,
      notes: f?.notes ?? req?.notes ?? null,
    };
  });

  const upcoming = rows
    .filter((r) => ACTIVE.includes(r.status) && r.scheduled_date >= today)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const upcomingIds = new Set(upcoming.map((r) => r.id));
  const history = rows.filter((r) => !upcomingIds.has(r.id));

  const error =
    addressesRes.error?.message ??
    subsRes.error?.message ??
    requestsRes.error?.message ??
    collectionsRes.error?.message ??
    plansRes.error?.message ??
    evidenceRes.error?.message ??
    failedRes.error?.message;

  const columns = [
    { header: "Scheduled", cell: (r: Row) => formatDay(r.scheduled_date) },
    {
      header: "Status",
      cell: (r: Row) => (
        <span className="space-y-1">
          <Status value={r.status} tones={COLLECTION_TONE} />
          {r.reason && <span className="block text-xs text-neutral-500">{r.reason}</span>}
        </span>
      ),
    },
    { header: "Service", cell: (r: Row) => r.service },
    { header: "Address", cell: (r: Row) => r.address },
    { header: "Arrived", cell: (r: Row) => formatDateTime(r.arrived_at) },
    {
      header: "Completed",
      cell: (r: Row) => (
        <span>
          {formatDateTime(r.completed_at)}
          {r.weight_kg !== null && <span className="block text-xs text-neutral-500">{r.weight_kg} kg</span>}
        </span>
      ),
    },
    { header: "Proof", cell: (r: Row) => (r.proofAt ? `Recorded ${formatDateTime(r.proofAt)}` : "—") },
    { header: "Notes", cell: (r: Row) => r.notes ?? "—" },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Collections</h1>
        <p className="text-sm text-neutral-600">Your upcoming and past waste collections.</p>
      </div>

      {error && <LoadError message={error} />}

      {!error && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-900">Upcoming</h2>
            <DataTable rows={upcoming} emptyMessage="No upcoming collections" columns={columns} />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-lg font-semibold text-neutral-900">History</h2>
              <form method="GET" className="flex items-end gap-2">
                <div>
                  <label htmlFor="status" className="mb-1 block text-xs font-medium text-neutral-600">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={statusFilter ?? ""}
                    className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
                  >
                    <option value="">All</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="outline">
                  Filter
                </Button>
              </form>
            </div>
            <DataTable rows={history} emptyMessage="No collection records yet." columns={columns} />
            <p className="text-xs text-neutral-500">
              Showing up to 200 most recent collections. &ldquo;Recorded&rdquo; means our crew captured photo/GPS proof
              of the collection; proof files are kept on file by Garbage Mania.
            </p>
          </section>
        </>
      )}
    </>
  );
}
