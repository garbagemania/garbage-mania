import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatDay } from "@/lib/format";
import { reviewRequest } from "./actions";

const FILTERS = ["submitted", "scheduled", "rejected", "cancelled", "all"] as const;
type Filter = (typeof FILTERS)[number];
const TONE = { submitted: "warning", approved: "info", scheduled: "success", rejected: "danger", cancelled: "neutral" } as const;

type Row = {
  id: string;
  waste_type: string;
  requested_date: string;
  notes: string | null;
  status: keyof typeof TONE;
  created_at: string;
  review_note: string | null;
  reviewed_at: string | null;
  resulting_collection_id: string | null;
  customers: { display_name: string } | { display_name: string }[] | null;
  service_addresses: { label: string } | { label: string }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { status?: string; saved?: string; error?: string };
}) {
  await requirePageRoles(["super_admin", "admin", "operations_manager"]);
  const filter: Filter = FILTERS.find((f) => f === searchParams.status) ?? "submitted";

  // Untyped: review_note/reviewed_at come from migration 023 (run `npm run db:types`).
  const db = createSupabaseServerClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("waste_collection_requests")
    .select(
      "id, waste_type, requested_date, notes, status, created_at, review_note, reviewed_at, resulting_collection_id, customers ( display_name ), service_addresses ( label )",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as unknown as Row[];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service requests"
        description="One-off collections customers ask for in their portal. Approve to schedule a collection, or reject with a reason."
      />

      {searchParams.saved && (
        <p role="status" className="rounded-md bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">{searchParams.saved}</p>
      )}
      {searchParams.error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{searchParams.error}</p>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/requests?status=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              f === filter
                ? "border-brand-green-500 bg-brand-green-50 text-brand-green-700"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({f === "all" ? rows.length : count(f)})
          </Link>
        ))}
      </nav>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Could not load requests: {error.message}</p>
      )}
      {!error && shown.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">
            {filter === "submitted" ? "No requests are waiting for review." : "No requests in this view."}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {shown.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">{one(r.customers)?.display_name ?? "Customer"}</h2>
                  <p className="text-sm text-neutral-600">
                    {one(r.service_addresses)?.label ?? "—"} · {r.waste_type} · wants {formatDay(r.requested_date)} · sent {formatDateTime(r.created_at)}
                  </p>
                </div>
                <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge>
              </div>
              {r.notes && <p className="text-sm text-neutral-700">Customer note: {r.notes}</p>}

              {r.status === "submitted" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <form action={reviewRequest} className="space-y-2 rounded-md border border-neutral-200 p-3">
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <label htmlFor={`d-${r.id}`} className="block text-xs font-medium text-neutral-600">Collection date</label>
                    <Input id={`d-${r.id}`} name="scheduledDate" type="date" required min={today} defaultValue={r.requested_date < today ? today : r.requested_date} />
                    <Input name="note" maxLength={500} placeholder="Optional note to the customer" aria-label="Note" />
                    <Button type="submit">Approve and schedule</Button>
                  </form>
                  <form action={reviewRequest} className="space-y-2 rounded-md border border-neutral-200 p-3">
                    <input type="hidden" name="requestId" value={r.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <label htmlFor={`n-${r.id}`} className="block text-xs font-medium text-neutral-600">Reason (required)</label>
                    <Input id={`n-${r.id}`} name="note" required maxLength={500} placeholder="e.g. Outside our service area" />
                    <Button type="submit" variant="danger">Reject</Button>
                  </form>
                </div>
              ) : (
                <p className="text-sm text-neutral-600">
                  {r.reviewed_at ? `Reviewed ${formatDateTime(r.reviewed_at)}. ` : ""}
                  {r.review_note ? `Note: ${r.review_note}. ` : ""}
                  {r.resulting_collection_id && (
                    <Link className="text-brand-green-700" href={`/admin/collections/${r.resulting_collection_id}`}>View collection</Link>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
