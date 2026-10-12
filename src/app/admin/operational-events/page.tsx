import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { profileNames } from "@/lib/admin/lookups";
import { DataTable, FilterBar, PageHeader } from "@/components/admin/page-kit";
import { formatDateTime, truncate } from "@/lib/format";

export default async function OperationalEventsPage({ searchParams }: { searchParams: { q?: string } }) {
  // operational_events is readable by super_admin and admin only (RLS).
  await requirePageRoles(["super_admin", "admin"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("operational_events")
    .select("id, event_type, related_table, related_id, actor_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (searchParams.q) query = query.ilike("event_type", `%${searchParams.q}%`);
  const { data, error } = await query;
  const actors = await profileNames(supabase, (data ?? []).map((e) => e.actor_id));

  return (
    <div className="space-y-6">
      <PageHeader title="Operational events" description="The 100 most recent operational events recorded by the system." />
      <FilterBar search={{ name: "q", label: "Event type", value: searchParams.q, placeholder: "e.g. collection" }} />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No operational events recorded."
        columns={[
          { header: "When", cell: (e) => formatDateTime(e.created_at) },
          { header: "Event", cell: (e) => <span className="font-medium text-neutral-900">{e.event_type}</span> },
          { header: "Related", cell: (e) => (e.related_table ? `${e.related_table}` : "—") },
          { header: "By", cell: (e) => (e.actor_id ? actors.get(e.actor_id) ?? "—" : "System") },
          {
            header: "Details",
            cell: (e) =>
              e.payload ? <code className="text-xs text-neutral-600">{truncate(JSON.stringify(e.payload), 100)}</code> : "—",
          },
        ]}
      />
    </div>
  );
}
