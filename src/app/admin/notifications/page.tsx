import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { formatDateTime } from "@/lib/format";

const STATUSES: Enum<"notification_status">[] = ["queued", "sent", "failed"];
const CHANNELS: Enum<"notification_channel">[] = ["sms", "email", "push"];

export default async function NotificationsPage({ searchParams }: { searchParams: { status?: string; channel?: string } }) {
  await requirePageRoles(["super_admin", "admin"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("notifications")
    .select("id, channel, template_code, status, related_table, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const status = pick(searchParams.status, STATUSES);
  const channel = pick(searchParams.channel, CHANNELS);
  if (status) query = query.eq("status", status);
  if (channel) query = query.eq("channel", channel);
  const { data, error } = await query;

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Notifications queued and sent by the system." />
      <FilterBar
        selects={[
          { name: "channel", label: "Channel", value: channel, options: CHANNELS },
          { name: "status", label: "Status", value: status, options: STATUSES },
        ]}
      />
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No notifications recorded."
        columns={[
          { header: "Created", cell: (n) => formatDateTime(n.created_at) },
          { header: "Template", cell: (n) => <span className="font-medium text-neutral-900">{n.template_code}</span> },
          { header: "Channel", cell: (n) => n.channel },
          { header: "About", cell: (n) => n.related_table ?? "—" },
          { header: "Status", cell: (n) => <StatusBadge value={n.status} tones={{ queued: "warning", sent: "success", failed: "danger" }} /> },
        ]}
      />
    </div>
  );
}
