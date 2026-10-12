import { todayNairobi } from "@/lib/portal/dates";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RealtimeCollectionsRefresh } from "@/components/admin/collections/realtime-refresh";
import type { CollectionStatus } from "@/types/database";

interface SearchParams {
  date?: string;
  status?: string;
}

const STATUS_TONE: Record<CollectionStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  scheduled: "info",
  assigned: "warning",
  in_progress: "warning",
  completed: "success",
  failed: "danger",
  rescheduled: "neutral",
  cancelled: "neutral",
};

export default async function CollectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createSupabaseServerClient();
  const date = searchParams.date || todayNairobi();

  let query = supabase
    .from("collections")
    .select(
      "id, scheduled_date, status, arrived_at, completed_at, service_addresses ( label, customers ( display_name ) ), daily_assignments ( routes ( name ) )",
    )
    .eq("scheduled_date", date)
    .order("status", { ascending: true })
    .limit(100);

  const validStatuses: CollectionStatus[] = [
    "scheduled",
    "assigned",
    "in_progress",
    "completed",
    "failed",
    "rescheduled",
    "cancelled",
  ];
  if (searchParams.status && validStatuses.includes(searchParams.status as CollectionStatus)) {
    query = query.eq("status", searchParams.status as CollectionStatus);
  }

  const { data: collections, error } = await query;

  return (
    <div className="space-y-6">
      <RealtimeCollectionsRefresh />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Collections</h1>
        <p className="text-sm text-neutral-600">
          Live — this page updates automatically as collection status changes.
        </p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="date" className="mb-1 block text-xs font-medium text-neutral-600">
            Date
          </label>
          <Input id="date" name="date" type="date" defaultValue={date} />
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
            {validStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {error && (
        <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          Could not load collections: {error.message}
        </p>
      )}

      {!error && collections && collections.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">
            No collections scheduled for {date}
            {searchParams.status ? ` with status "${searchParams.status}"` : ""}.
          </CardContent>
        </Card>
      )}

      {collections && collections.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Address</th>
                <th className="px-4 py-2">Route</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-2 text-neutral-700">{c.service_addresses?.customers?.display_name}</td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/collections/${c.id}`} className="font-medium text-brand-green-700">
                      {c.service_addresses?.label}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{c.daily_assignments?.routes?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
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
