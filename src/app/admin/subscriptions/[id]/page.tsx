import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { changeSubscriptionStatus } from "../actions";
import type { SubscriptionStatus } from "@/types/database";

const CAN_MANAGE = ["super_admin", "admin"];

// Mirrors the rows seeded for entity_type='subscriptions' in
// status_transition_rules (001_identity.sql) - used only to decide which
// buttons to show. The database trigger (enforce_status_transition) is
// the actual authority; if this map and the seeded rules ever disagreed,
// the trigger wins and the action fails with a clear error rather than
// silently succeeding.
const NEXT_STATUSES: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  pending: ["active", "cancelled"],
  active: ["paused", "cancelled"],
  paused: ["active", "cancelled"],
  cancelled: [],
};

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireAuthenticatedUser();
  const supabase = createSupabaseServerClient();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select(
      "id, status, frequency, start_date, end_date, customers ( id, display_name ), service_plans ( name ), service_addresses ( label ), contracts ( contract_number )",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!subscription) notFound();

  const { data: history } = await supabase
    .from("subscription_history")
    .select("id, change_type, created_at")
    .eq("subscription_id", subscription.id)
    .order("created_at", { ascending: false });

  const canManage = user.role ? CAN_MANAGE.includes(user.role) : false;
  const nextStatuses = NEXT_STATUSES[subscription.status] ?? [];

  return (
    <div className="space-y-6">
      {searchParams.error && (
        <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">{searchParams.error}</p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl">{subscription.service_plans?.name}</CardTitle>
            <p className="mt-1 text-sm text-neutral-600">
              <Link href={`/admin/customers/${subscription.customers?.id}`} className="text-brand-green-700">
                {subscription.customers?.display_name}
              </Link>{" "}
              · {subscription.service_addresses?.label}
            </p>
          </div>
          <Badge
            tone={
              subscription.status === "active"
                ? "success"
                : subscription.status === "cancelled"
                  ? "neutral"
                  : "warning"
            }
          >
            {subscription.status}
          </Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-neutral-500">Contract</p>
            <p className="text-neutral-900">{subscription.contracts?.contract_number}</p>
          </div>
          <div>
            <p className="text-neutral-500">Frequency</p>
            <p className="capitalize text-neutral-900">{subscription.frequency}</p>
          </div>
          <div>
            <p className="text-neutral-500">Start date</p>
            <p className="text-neutral-900">{subscription.start_date}</p>
          </div>
          {subscription.end_date && (
            <div>
              <p className="text-neutral-500">End date</p>
              <p className="text-neutral-900">{subscription.end_date}</p>
            </div>
          )}
        </CardContent>
        {canManage && nextStatuses.length > 0 && (
          <CardContent className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
            {nextStatuses.map((status) => (
              <form key={status} action={changeSubscriptionStatus.bind(null, subscription.id)}>
                <input type="hidden" name="status" value={status} />
                <Button type="submit" variant={status === "cancelled" ? "danger" : "outline"} size="sm">
                  {status === "active" ? "Activate" : status === "paused" ? "Pause" : "Cancel"}
                </Button>
              </form>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <ul className="divide-y divide-neutral-100 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2">
                  <span className="capitalize text-neutral-700">{h.change_type.replace("_", " ")}</span>
                  <span className="text-neutral-500">{new Date(h.created_at).toLocaleString("en-KE")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No history yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
