import Link from "next/link";
import { Button } from "@/components/ui/button";
import { todayNairobi } from "@/lib/portal/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, StatusBadge } from "@/components/admin/page-kit";
import { customerNames } from "@/lib/admin/lookups";
import { formatCents, formatDay, formatDateTime } from "@/lib/format";

interface Metric {
  label: string;
  value: number | null;
  hint?: string;
}

/**
 * Real dashboard: every number here is a live count query against
 * Supabase, scoped by the signed-in user's own RLS permissions (this page
 * uses the authenticated server client, never the service-role client -
 * see src/lib/supabase/server.ts). A metric is included only for roles
 * whose RLS policies actually grant them read access to that table (e.g.
 * operations_manager cannot read invoices - 011_rls_policies.sql - so
 * "Outstanding invoices" is simply not shown to that role, rather than
 * shown as a misleading zero). No metric here is invented, estimated, or
 * hardcoded.
 */
export default async function AdminDashboardPage() {
  const user = await requireAuthenticatedUser();
  const role = user.role;
  const supabase = createSupabaseServerClient();
  const today = todayNairobi();

  const metrics: Metric[] = [];

  const canManageFleet = role === "super_admin" || role === "operations_manager";
  const quickActions: { href: string; label: string }[] = [
    ...(role !== "finance"
      ? [
          { href: "/admin/customers/new", label: "+ New customer" },
          { href: "/admin/properties/new", label: "+ Add property" },
        ]
      : []),
    ...(canManageFleet
      ? [
          { href: "/admin/routes/new", label: "+ New route" },
          { href: "/admin/vehicles/new", label: "+ Add vehicle" },
        ]
      : []),
    ...(role === "super_admin" ? [{ href: "/admin/staff/new?role=driver", label: "+ Add driver" }] : []),
  ];

  // Customers — visible to all four staff roles (011_rls_policies.sql:
  // customers_select_staff).
  {
    const { count } = await supabase.from("customers").select("*", { count: "exact", head: true });
    metrics.push({ label: "Customers", value: count ?? null });
  }

  // Active subscriptions — same four roles.
  {
    const { count } = await supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");
    metrics.push({ label: "Active subscriptions", value: count ?? null });
  }

  // Today's collections — same four roles can read collections.
  {
    const { count: totalToday } = await supabase
      .from("collections")
      .select("*", { count: "exact", head: true })
      .eq("scheduled_date", today);
    metrics.push({ label: "Today's collections", value: totalToday ?? null });

    const { count: completedToday } = await supabase
      .from("collections")
      .select("*", { count: "exact", head: true })
      .eq("scheduled_date", today)
      .eq("status", "completed");
    metrics.push({ label: "Completed today", value: completedToday ?? null });

    const { count: failedToday } = await supabase
      .from("collections")
      .select("*", { count: "exact", head: true })
      .eq("scheduled_date", today)
      .in("status", ["failed", "cancelled"]);
    metrics.push({ label: "Failed/cancelled today", value: failedToday ?? null, hint: "Operational exceptions" });
  }

  // Outstanding invoices — only super_admin/admin/finance can read
  // invoices at all (invoices_select_staff). Omitted for
  // operations_manager rather than shown as a false zero.
  if (role === "super_admin" || role === "admin" || role === "finance") {
    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .in("status", ["issued", "partially_paid", "overdue"]);
    metrics.push({ label: "Outstanding invoices", value: count ?? null });
  }

  const canSeeFinance = role === "super_admin" || role === "admin" || role === "finance";
  if (canSeeFinance) {
    const { count: confirmed } = await supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed");
    metrics.push({ label: "Payments received", value: confirmed ?? null, hint: "Confirmed payments, all time" });

    const { count: pending } = await supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    metrics.push({ label: "Pending payments", value: pending ?? null });
  }

  // Recent activity — real rows only, read through the caller's RLS.
  const { data: recentCustomers, error: recentCustomersError } = await supabase
    .from("customers")
    .select("id, display_name, customer_type, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentCollections, error: recentCollectionsError } = await supabase
    .from("collections")
    .select("id, scheduled_date, status, service_addresses ( label, customers ( display_name ) )")
    .order("scheduled_date", { ascending: false })
    .limit(5);

  const { data: recentPayments, error: recentPaymentsError } = canSeeFinance
    ? await supabase
        .from("payments")
        .select("id, customer_id, amount_cents, currency, status, received_at")
        .order("received_at", { ascending: false })
        .limit(5)
    : { data: null, error: null };
  const paymentCustomers = await customerNames(supabase, (recentPayments ?? []).map((p) => p.customer_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-600">
          Live counts from the database — nothing on this page is invented.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {quickActions.map((a) => (
          <Link key={a.href} href={a.href}>
            <Button variant="outline">{a.label}</Button>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-neutral-500">{metric.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {metric.value === null ? (
                <p className="text-sm text-neutral-400">Could not load</p>
              ) : (
                <p className="text-3xl font-semibold text-neutral-900">{metric.value}</p>
              )}
              {metric.hint && <p className="mt-1 text-xs text-neutral-500">{metric.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-900">Recent collections</h2>
          <DataTable
            error={recentCollectionsError}
            rows={recentCollections}
            emptyMessage="No collections recorded."
            columns={[
              { header: "Date", cell: (c) => formatDay(c.scheduled_date) },
              { header: "Customer", cell: (c) => c.service_addresses?.customers?.display_name ?? "—" },
              {
                header: "Status",
                cell: (c) => (
                  <StatusBadge
                    value={c.status}
                    tones={{ scheduled: "info", assigned: "warning", in_progress: "warning", completed: "success", failed: "danger", rescheduled: "neutral", cancelled: "neutral" }}
                  />
                ),
              },
            ]}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-900">Recent customers</h2>
          <DataTable
            error={recentCustomersError}
            rows={recentCustomers}
            emptyMessage="No customers found."
            columns={[
              { header: "Customer", cell: (c) => c.display_name },
              { header: "Type", cell: (c) => c.customer_type },
              { header: "Added", cell: (c) => formatDay(c.created_at) },
            ]}
          />
        </section>

        {canSeeFinance && (
          <section className="space-y-2 lg:col-span-2">
            <h2 className="text-lg font-semibold text-neutral-900">Recent payments</h2>
            <DataTable
              error={recentPaymentsError}
              rows={recentPayments}
              emptyMessage="No payments recorded."
              columns={[
                { header: "Received", cell: (p) => formatDateTime(p.received_at) },
                { header: "Customer", cell: (p) => paymentCustomers.get(p.customer_id) ?? "—" },
                { header: "Amount", cell: (p) => formatCents(p.amount_cents, p.currency), align: "right" },
                {
                  header: "Status",
                  cell: (p) => (
                    <StatusBadge value={p.status} tones={{ pending: "warning", confirmed: "success", failed: "danger", reversed: "neutral" }} />
                  ),
                },
              ]}
            />
          </section>
        )}
      </div>

      {metrics.every((m) => m.value === 0) && (
        <p className="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
          No customer, subscription, or collection data yet. Figures above will populate as real records are
          created in Customers, Subscriptions, and Collections.
        </p>
      )}
    </div>
  );
}
