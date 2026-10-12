import { todayNairobi } from "@/lib/portal/dates";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GeoFields } from "@/components/driver/geo-fields";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { markArrived, markCollected, markFailed } from "./actions";

type Property = { address_line: string; ward: string | null; sub_county: string | null; county: string } | null;
type Row = {
  id: string;
  scheduled_date: string;
  status: "scheduled" | "assigned" | "in_progress" | "completed" | "failed" | "rescheduled" | "cancelled";
  arrived_at: string | null;
  completed_at: string | null;
  service_addresses: { label: string; properties: Property | Property[] } | { label: string; properties: Property | Property[] }[] | null;
  collection_evidence: { id: string }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const TONE = {
  scheduled: "neutral", assigned: "warning", in_progress: "warning",
  completed: "success", failed: "danger", rescheduled: "neutral", cancelled: "neutral",
} as const;
const REASONS: [string, string][] = [
  ["gate_locked", "Gate locked"],
  ["customer_absent", "Customer absent"],
  ["bin_not_out", "Bin not out"],
  ["weather", "Weather"],
  ["vehicle_issue", "Vehicle issue"],
  ["other", "Other"],
];

export default async function DriverHomePage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const today = todayNairobi();

  // RLS limits this to collections on assignments this driver is assigned to.
  const { data, error } = await supabase
    .from("collections")
    .select(
      "id, scheduled_date, status, arrived_at, completed_at, " +
        "service_addresses ( label, properties ( address_line, ward, sub_county, county ) ), " +
        "collection_evidence ( id )",
    )
    .lte("scheduled_date", today)
    .in("status", ["assigned", "in_progress", "completed", "failed"])
    .order("scheduled_date", { ascending: true })
    .limit(100);

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.scheduled_date === today || r.status === "assigned" || r.status === "in_progress",
  );

  return (
    <AppShell title="Today's Route">
      <div className="space-y-4">
        {searchParams.saved && (
          <p role="status" className="rounded-md bg-brand-green-50 px-3 py-2 text-sm text-brand-green-700">
            {searchParams.saved}
          </p>
        )}
        {searchParams.error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Could not load your stops: {error.message}
          </p>
        )}

        {!error && rows.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No stops assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-neutral-600">
                You have no collections assigned for today. Operations will assign your route.
              </p>
            </CardContent>
          </Card>
        )}

        {rows.map((r) => {
          const sa = one(r.service_addresses);
          const p = one(sa?.properties ?? null);
          const open = r.status === "assigned" || r.status === "in_progress";
          const place = [p?.address_line, p?.ward, p?.sub_county, p?.county].filter(Boolean).join(", ");
          return (
            <Card key={r.id}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-neutral-900">{sa?.label ?? "Stop"}</p>
                    <p className="text-sm text-neutral-600">{place || "Address not available"}</p>
                    <p className="text-xs text-neutral-500">
                      {r.scheduled_date !== today ? `Overdue from ${r.scheduled_date} · ` : ""}
                      {r.arrived_at ? `Arrived ${formatDateTime(r.arrived_at)}` : "Not yet arrived"}
                      {r.completed_at ? ` · Done ${formatDateTime(r.completed_at)}` : ""}
                    </p>
                  </div>
                  <Badge tone={TONE[r.status]}>{r.status.replace("_", " ")}</Badge>
                </div>

                {open && (
                  <div className="space-y-3 border-t border-neutral-100 pt-3">
                    {r.status === "assigned" && (
                      <form action={markArrived} className="flex items-center gap-3">
                        <input type="hidden" name="collectionId" value={r.id} />
                        <GeoFields />
                        <Button type="submit" variant="outline" size="sm">Arrived</Button>
                      </form>
                    )}

                    <form action={markCollected} className="space-y-2" encType="multipart/form-data">
                      <input type="hidden" name="collectionId" value={r.id} />
                      <label className="block text-xs font-medium text-neutral-600" htmlFor={`photo-${r.id}`}>
                        Proof photo (required)
                      </label>
                      <input
                        id={`photo-${r.id}`}
                        name="photo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        required
                        className="block w-full text-sm"
                      />
                      <div className="flex items-center gap-3">
                        <GeoFields />
                        <Button type="submit" size="sm">Collected</Button>
                      </div>
                    </form>

                    <form action={markFailed} className="space-y-2">
                      <input type="hidden" name="collectionId" value={r.id} />
                      <div className="flex gap-2">
                        <select
                          name="reason"
                          required
                          defaultValue=""
                          aria-label="Reason"
                          className="h-8 flex-1 rounded-md border border-neutral-300 px-2 text-sm"
                        >
                          <option value="" disabled>Reason for missing…</option>
                          {REASONS.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <Button type="submit" variant="danger" size="sm">Failed / Missed</Button>
                      </div>
                      <input
                        name="notes"
                        maxLength={1000}
                        placeholder="Notes (optional)"
                        className="h-8 w-full rounded-md border border-neutral-300 px-2 text-sm"
                      />
                    </form>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
