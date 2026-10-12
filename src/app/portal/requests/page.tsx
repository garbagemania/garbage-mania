import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/admin/page-kit";
import { formatDay } from "@/lib/format";
import { getPortalContext } from "@/lib/portal/customer";
import { todayNairobi } from "@/lib/portal/dates";
import { LoadError, NoCustomerAccount, Notice, REQUEST_TONE, Status, label } from "@/components/portal/portal-ui";
import { cancelRequest, submitRequest } from "./actions";

const WASTE_TYPES = ["general", "recyclable", "organic", "hazardous", "bulky"] as const;

export default async function RequestsPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  const [requestsRes, addressesRes] = await Promise.all([
    supabase
      .from("waste_collection_requests")
      .select("id, service_address_id, waste_type, requested_date, notes, status, resulting_collection_id, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("service_addresses").select("id, label, status").eq("customer_id", customerId),
  ]);

  const requests = requestsRes.data ?? [];
  const addresses = addressesRes.data ?? [];
  const activeAddresses = addresses.filter((a) => a.status === "active");
  const addressLabel = new Map(addresses.map((a) => [a.id, a.label]));

  const resultingIds = requests.map((r) => r.resulting_collection_id).filter((id): id is string => Boolean(id));
  const resultingRes = await supabase.from("collections").select("id, scheduled_date, status").in("id", resultingIds);
  const resulting = new Map((resultingRes.data ?? []).map((c) => [c.id, c]));

  // The staff reply (e.g. why a request was rejected). Separate untyped query
  // because review_note comes from migration 023 (run `npm run db:types`);
  // a failure here just hides the reply, it never breaks the page.
  const noteRes = await (supabase as unknown as SupabaseClient)
    .from("waste_collection_requests")
    .select("id, review_note")
    .eq("customer_id", customerId)
    .not("review_note", "is", null);
  const replies = new Map(((noteRes.data ?? []) as { id: string; review_note: string }[]).map((n) => [n.id, n.review_note]));

  const error = requestsRes.error?.message ?? addressesRes.error?.message ?? resultingRes.error?.message;
  const today = todayNairobi();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Service requests</h1>
        <p className="text-sm text-neutral-600">Ask for an extra collection and track its progress.</p>
      </div>

      <Notice success={searchParams.saved ? "Your request has been submitted." : undefined} error={searchParams.error} />
      {error && <LoadError message={error} />}

      <Card>
        <CardHeader>
          <CardTitle>Request a collection</CardTitle>
        </CardHeader>
        <CardContent>
          {activeAddresses.length === 0 ? (
            <p className="text-sm text-neutral-600">
              You need an active service address before you can request a collection.{" "}
              <Link href="/portal/addresses/new" className="text-brand-green-600 hover:underline">
                Add an address
              </Link>
            </p>
          ) : (
            <form action={submitRequest} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="serviceAddressId" className="mb-1 block text-xs font-medium text-neutral-600">
                  Service address
                </label>
                <select
                  id="serviceAddressId"
                  name="serviceAddressId"
                  required
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  {activeAddresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="wasteType" className="mb-1 block text-xs font-medium text-neutral-600">
                  Waste type
                </label>
                <select
                  id="wasteType"
                  name="wasteType"
                  required
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  {WASTE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="requestedDate" className="mb-1 block text-xs font-medium text-neutral-600">
                  Preferred date
                </label>
                <Input id="requestedDate" name="requestedDate" type="date" required min={today} defaultValue={today} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notes" className="mb-1 block text-xs font-medium text-neutral-600">
                  Notes (optional)
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Submit request</Button>
                <p className="mt-2 text-xs text-neutral-500">
                  Only collection requests can be submitted online. For a missed collection, a service issue or to
                  change your plan, please contact Garbage Mania.
                </p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Request history</h2>
        <DataTable
          rows={error ? null : requests}
          emptyMessage="You haven't submitted any requests yet."
          columns={[
            { header: "Submitted", cell: (r) => formatDay(r.created_at) },
            { header: "Preferred date", cell: (r) => formatDay(r.requested_date) },
            { header: "Waste type", cell: (r) => label(r.waste_type) },
            { header: "Address", cell: (r) => addressLabel.get(r.service_address_id) ?? "—" },
            { header: "Status", cell: (r) => <Status value={r.status} tones={REQUEST_TONE} /> },
            {
              header: "Scheduled collection",
              cell: (r) => {
                const c = r.resulting_collection_id ? resulting.get(r.resulting_collection_id) : undefined;
                return c ? `${formatDay(c.scheduled_date)} (${label(c.status)})` : "—";
              },
            },
            { header: "Notes", cell: (r) => r.notes ?? "—" },
            { header: "Reply from Garbage Mania", cell: (r) => replies.get(r.id) ?? "—" },
            {
              header: "",
              cell: (r) =>
                r.status === "submitted" ? (
                  <form action={cancelRequest}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <button type="submit" className="text-sm font-medium text-red-700 hover:underline">Cancel</button>
                  </form>
                ) : null,
            },
          ]}
        />
      </section>
    </>
  );
}
