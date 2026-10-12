import { todayNairobi } from "@/lib/portal/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { DataTable, FilterBar, PageHeader, StatusBadge, pick, type Enum } from "@/components/admin/page-kit";
import { formatDay } from "@/lib/format";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/admin/form-kit";

const STATUSES: Enum<"driver_status">[] = ["active", "suspended", "inactive"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default async function DriversPage({ searchParams }: { searchParams: { status?: string; saved?: string; error?: string } }) {
  const user = await requirePageRoles(["super_admin", "admin", "operations_manager"]);
  const canEdit = user.role === "super_admin" || user.role === "operations_manager";
  const canAdd = user.role === "super_admin"; // creating a driver also creates a login, which only a super admin can do
  const supabase = createSupabaseServerClient();
  const today = todayNairobi();

  let query = supabase
    .from("drivers")
    .select("id, license_number, license_expiry, status")
    .order("created_at", { ascending: false })
    .limit(200);
  const status = pick(searchParams.status, STATUSES);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;

  const ids = (data ?? []).map((d) => d.id);
  const people = new Map<string, { name: string; phone: string | null }>();
  const employeeNumbers = new Map<string, string>();
  const assignedToday = new Map<string, number>();

  if (ids.length > 0) {
    const [{ data: profiles }, { data: staff }, { data: runs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, phone").in("id", ids),
      supabase.from("staff_profiles").select("id, employee_number").in("id", ids),
      supabase.from("daily_assignments").select("id").eq("assignment_date", today),
    ]);
    for (const p of profiles ?? []) people.set(p.id, { name: p.full_name, phone: p.phone });
    for (const s of staff ?? []) employeeNumbers.set(s.id, s.employee_number);

    const runIds = (runs ?? []).map((r) => r.id);
    if (runIds.length > 0) {
      const { data: assigned } = await supabase
        .from("driver_assignments")
        .select("driver_id")
        .in("daily_assignment_id", runIds);
      for (const a of assigned ?? []) assignedToday.set(a.driver_id, (assignedToday.get(a.driver_id) ?? 0) + 1);
    }
  }

  const soon = Date.now() + THIRTY_DAYS_MS;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drivers"
        description="Collection staff with a driver record, and today's assigned runs."
        action={canAdd ? <Link href="/admin/staff/new?role=driver"><Button>+ Add driver</Button></Link> : undefined}
      />
      <FormMessage error={searchParams.error} saved={searchParams.saved} />
      {!canAdd && (
        <p className="text-sm text-neutral-600">New drivers are added by a super admin (Staff &gt; Add staff). You can edit licence details and status here.</p>
      )}
      <FilterBar selects={[{ name: "status", label: "Status", value: status, options: STATUSES }]} />
      <DataTable
        error={error}
        rows={data}
        emptyMessage={canAdd ? "No drivers yet. Use “+ Add driver” to create the first one." : "No drivers found."}
        columns={[
          {
            header: "Name",
            cell: (d) =>
              canEdit ? (
                <Link href={`/admin/drivers/${d.id}`} className="font-medium text-brand-green-700">{people.get(d.id)?.name ?? "—"}</Link>
              ) : (
                <span className="font-medium text-neutral-900">{people.get(d.id)?.name ?? "—"}</span>
              ),
          },
          { header: "Employee no.", cell: (d) => employeeNumbers.get(d.id) ?? "—" },
          { header: "Phone", cell: (d) => people.get(d.id)?.phone ?? "—" },
          { header: "Licence", cell: (d) => d.license_number },
          {
            header: "Licence expiry",
            cell: (d) => {
              const expiring = new Date(d.license_expiry).getTime() < soon;
              return <span className={expiring ? "font-medium text-danger" : ""}>{formatDay(d.license_expiry)}</span>;
            },
          },
          { header: "Runs today", cell: (d) => assignedToday.get(d.id) ?? 0, align: "right" },
          {
            header: "Status",
            cell: (d) => <StatusBadge value={d.status} tones={{ active: "success", suspended: "warning", inactive: "neutral" }} />,
          },
        ]}
      />
    </div>
  );
}
