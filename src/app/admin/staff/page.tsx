import Link from "next/link";
import { createSupabaseServerClient, createSupabaseAuthAdminClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { ASSIGNABLE_STAFF_ROLES, STAFF_MANAGERS } from "@/types/roles";
import { formatDateTime } from "@/lib/format";
import { STAFF_ROLE_LABELS as ROLE_LABELS } from "@/config/staff";

const STATUSES = ["active", "suspended", "disabled"] as const;
const STATUS_TONES = { active: "success", suspended: "warning", disabled: "danger" } as const;

/** Emails live in auth.users, which RLS never exposes; read them via the Auth admin API. */
async function loadEmails(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await createSupabaseAuthAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email) map.set(u.id, u.email);
  } catch {
    // Service key not configured here: show the list without emails.
  }
  return map;
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: { role?: string; status?: string; saved?: string; error?: string };
}) {
  await requirePageRoles([...STAFF_MANAGERS]);
  const supabase = createSupabaseServerClient();

  const role = pick(searchParams.role, ASSIGNABLE_STAFF_ROLES);
  const status = pick(searchParams.status, STATUSES);

  const [{ data: roles }, { data: profiles, error }, { data: staff }, emails] = await Promise.all([
    supabase.from("roles").select("id, code"),
    supabase
      .from("profiles")
      .select("id, full_name, phone, status, role_id, last_seen_at")
      .eq("kind", "staff")
      .order("full_name")
      .limit(500),
    supabase.from("staff_profiles").select("id, employee_number, department"),
    loadEmails(),
  ]);

  const roleCode = new Map((roles ?? []).map((r) => [r.id, r.code]));
  const employee = new Map((staff ?? []).map((s) => [s.id, s]));

  const rows = (profiles ?? [])
    .map((p) => ({ ...p, roleCode: roleCode.get(p.role_id) ?? "" }))
    .filter((p) => (!role || p.roleCode === role) && (!status || p.status === status));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Everyone who can sign in to the admin, finance and driver screens. Customers are managed separately."
        action={
          <Link href="/admin/staff/new">
            <Button>Add staff member</Button>
          </Link>
        }
      />

      {searchParams.saved && (
        <p role="status" className="rounded-md bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">
          {searchParams.saved}
        </p>
      )}
      {searchParams.error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <FilterBar
        selects={[
          { name: "role", label: "Role", value: role, options: [...ASSIGNABLE_STAFF_ROLES] },
          { name: "status", label: "Status", value: status, options: [...STATUSES] },
        ]}
      />

      <DataTable
        error={error}
        rows={rows}
        emptyMessage="No staff match these filters."
        columns={[
          {
            header: "Name",
            cell: (p) => (
              <Link className="font-medium text-brand-green-700" href={`/admin/staff/${p.id}`}>
                {p.full_name}
              </Link>
            ),
          },
          { header: "Email", cell: (p) => emails.get(p.id) ?? "—" },
          { header: "Role", cell: (p) => ROLE_LABELS[p.roleCode] ?? p.roleCode },
          { header: "Employee no.", cell: (p) => employee.get(p.id)?.employee_number ?? "—" },
          { header: "Status", cell: (p) => <StatusBadge value={p.status} tones={STATUS_TONES} /> },
          { header: "Last seen", cell: (p) => (p.last_seen_at ? formatDateTime(p.last_seen_at) : "—") },
        ]}
      />
    </div>
  );
}
