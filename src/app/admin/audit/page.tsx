import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { profileNames } from "@/lib/admin/lookups";
import { DataTable, PageHeader } from "@/components/admin/page-kit";
import { formatDateTime, truncate } from "@/lib/format";

export default async function AuditPage({ searchParams }: { searchParams: { table?: string; action?: string } }) {
  await requirePageRoles(["super_admin", "admin"]);
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("audit_log")
    .select("id, table_name, record_id, action, actor_id, new_data, old_data, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (searchParams.table) query = query.ilike("table_name", `%${searchParams.table}%`);
  if (searchParams.action) query = query.ilike("action", `%${searchParams.action}%`);
  const { data, error } = await query;
  const actors = await profileNames(supabase, (data ?? []).map((a) => a.actor_id));

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="The 100 most recent recorded changes, newest first." />
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <FilterBarFields table={searchParams.table} action={searchParams.action} />
      </form>
      <DataTable
        error={error}
        rows={data}
        emptyMessage="No audit entries recorded."
        columns={[
          { header: "When", cell: (a) => formatDateTime(a.created_at) },
          { header: "User", cell: (a) => (a.actor_id ? actors.get(a.actor_id) ?? "Unknown user" : "System") },
          { header: "Action", cell: (a) => a.action },
          { header: "Entity", cell: (a) => <span className="font-medium text-neutral-900">{a.table_name}</span> },
          {
            header: "Details",
            cell: (a) => {
              const detail = a.new_data ?? a.old_data;
              return detail ? (
                <details>
                  <summary className="cursor-pointer text-brand-green-700">View</summary>
                  <code className="mt-1 block max-w-md break-all text-xs text-neutral-600">{truncate(JSON.stringify(detail), 600)}</code>
                </details>
              ) : (
                "—"
              );
            },
          },
        ]}
      />
    </div>
  );
}

function FilterBarFields({ table, action }: { table?: string; action?: string }) {
  return (
    <>
      <div>
        <label htmlFor="table" className="mb-1 block text-xs font-medium text-neutral-600">
          Entity
        </label>
        <input id="table" name="table" defaultValue={table ?? ""} placeholder="e.g. invoices" className="h-9 rounded-md border border-neutral-300 px-2 text-sm" />
      </div>
      <div>
        <label htmlFor="action" className="mb-1 block text-xs font-medium text-neutral-600">
          Action
        </label>
        <input id="action" name="action" defaultValue={action ?? ""} placeholder="e.g. UPDATE" className="h-9 rounded-md border border-neutral-300 px-2 text-sm" />
      </div>
      <button type="submit" className="h-9 rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-50">
        Filter
      </button>
    </>
  );
}
