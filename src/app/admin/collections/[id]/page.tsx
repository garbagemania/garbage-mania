import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { changeCollectionStatus } from "../actions";
import type { CollectionStatus } from "@/types/database";

const CAN_TRANSITION = ["super_admin", "operations_manager"];

const NEXT_STATUSES: Record<CollectionStatus, CollectionStatus[]> = {
  scheduled: ["assigned", "cancelled"],
  assigned: ["in_progress", "failed", "cancelled"],
  in_progress: ["completed", "failed"],
  completed: [],
  failed: ["rescheduled"],
  rescheduled: [],
  cancelled: [],
};

const REASON_REQUIRED: CollectionStatus[] = ["failed", "cancelled"];

export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireAuthenticatedUser();
  const supabase = createSupabaseServerClient();

  const { data: collection } = await supabase
    .from("collections")
    .select(
      "id, scheduled_date, status, arrived_at, completed_at, weight_kg, service_addresses ( label, customers ( id, display_name ) ), daily_assignments ( routes ( name ) )",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!collection) notFound();

  const { data: events } = await supabase
    .from("collection_status_events")
    .select("id, from_status, to_status, reason_code, created_at")
    .eq("collection_id", collection.id)
    .order("created_at", { ascending: false });

  const canTransition = user.role ? CAN_TRANSITION.includes(user.role) : false;
  const nextStatuses = NEXT_STATUSES[collection.status] ?? [];

  return (
    <div className="space-y-6">
      {searchParams.error && (
        <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">{searchParams.error}</p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{collection.service_addresses?.label}</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">{collection.service_addresses?.customers?.display_name}</p>
          </div>
          <Badge tone={collection.status === "completed" ? "success" : "warning"}>{collection.status}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-neutral-500">Scheduled date</p>
            <p className="text-neutral-900">{collection.scheduled_date}</p>
          </div>
          <div>
            <p className="text-neutral-500">Route</p>
            <p className="text-neutral-900">{collection.daily_assignments?.routes?.name ?? "Not yet dispatched"}</p>
          </div>
          {collection.arrived_at && (
            <div>
              <p className="text-neutral-500">Arrived</p>
              <p className="text-neutral-900">{new Date(collection.arrived_at).toLocaleString("en-KE")}</p>
            </div>
          )}
          {collection.completed_at && (
            <div>
              <p className="text-neutral-500">Completed</p>
              <p className="text-neutral-900">{new Date(collection.completed_at).toLocaleString("en-KE")}</p>
            </div>
          )}
          {collection.weight_kg && (
            <div>
              <p className="text-neutral-500">Weight</p>
              <p className="text-neutral-900">{collection.weight_kg} kg</p>
            </div>
          )}
        </CardContent>

        {canTransition && nextStatuses.length > 0 && (
          <CardContent className="space-y-3 border-t border-neutral-100 pt-4">
            {nextStatuses.map((status) => (
              <form key={status} action={changeCollectionStatus.bind(null, collection.id)} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="status" value={status} />
                {REASON_REQUIRED.includes(status) && (
                  <select
                    name="reasonCode"
                    required
                    defaultValue=""
                    className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
                  >
                    <option value="" disabled>
                      Reason for {status}
                    </option>
                    {status === "cancelled" ? (
                      <>
                        <option value="customer_cancelled">Customer cancelled</option>
                        <option value="operational_cancelled">Operational cancellation</option>
                        <option value="weather">Weather</option>
                        <option value="vehicle_issue">Vehicle issue</option>
                        <option value="other">Other</option>
                      </>
                    ) : (
                      <>
                        <option value="gate_locked">Gate locked</option>
                        <option value="customer_absent">Customer absent</option>
                        <option value="bin_not_out">Bin not out</option>
                        <option value="vehicle_issue">Vehicle issue</option>
                        <option value="other">Other</option>
                      </>
                    )}
                  </select>
                )}
                <Button type="submit" variant={status === "cancelled" || status === "failed" ? "danger" : "outline"} size="sm">
                  Mark {status.replace("_", " ")}
                </Button>
              </form>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status history</CardTitle>
        </CardHeader>
        <CardContent>
          {events && events.length > 0 ? (
            <ul className="divide-y divide-neutral-100 text-sm">
              {events.map((e) => (
                <li key={e.id} className="py-2">
                  <p className="text-neutral-800">
                    {e.from_status ?? "created"} → <span className="font-medium">{e.to_status}</span>
                    {e.reason_code && <span className="text-neutral-500"> ({e.reason_code.replace("_", " ")})</span>}
                  </p>
                  <p className="text-xs text-neutral-500">{new Date(e.created_at).toLocaleString("en-KE")}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No status changes recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
