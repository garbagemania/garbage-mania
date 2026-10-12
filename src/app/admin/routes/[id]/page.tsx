import { todayNairobi } from "@/lib/portal/dates";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { activeDriverOptions, activeVehicleOptions } from "@/lib/admin/lookups";
import { DataTable, PageHeader, StatusBadge } from "@/components/admin/page-kit";
import { Field, FormMessage, selectClass } from "@/components/admin/form-kit";
import { RouteFields } from "@/components/admin/route-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDay } from "@/lib/format";
import { addRouteStop, cancelRun, removeRouteStop, scheduleRun, updateRoute } from "../actions";

export default async function RouteDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; error?: string };
}) {
  const user = await requirePageRoles(["super_admin", "admin", "operations_manager"]);
  const canManage = user.role === "super_admin" || user.role === "operations_manager";
  const supabase = createSupabaseServerClient();
  const today = todayNairobi();

  const { data: route } = await supabase
    .from("routes")
    .select("id, name, area, status, default_driver_id, default_vehicle_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!route) notFound();

  const { data: stops, error: stopsError } = await supabase
    .from("route_stops")
    .select("id, service_address_id, sequence_number, service_addresses ( label, customers ( id, display_name ) )")
    .eq("route_id", route.id)
    .order("sequence_number", { ascending: true });

  const { data: assignments, error: assignmentsError } = await supabase
    .from("daily_assignments")
    .select("id, assignment_date, status, driver_assignments ( driver_id, vehicle_id )")
    .eq("route_id", route.id)
    .gte("assignment_date", today)
    .order("assignment_date", { ascending: true })
    .limit(30);

  // Everything the management forms need, only fetched for people who can use them.
  let drivers: { id: string; label: string }[] = [];
  let vehicles: { id: string; label: string }[] = [];
  let addressOptions: { id: string; label: string }[] = [];
  if (canManage) {
    [drivers, vehicles] = await Promise.all([activeDriverOptions(supabase), activeVehicleOptions(supabase)]);
    const onRoute = new Set((stops ?? []).map((s) => s.service_address_id));
    const { data: addresses } = await supabase
      .from("service_addresses")
      .select("id, label, customers ( display_name )")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(500);
    addressOptions = (addresses ?? [])
      .filter((a) => !onRoute.has(a.id))
      .map((a) => ({ id: a.id, label: `${a.customers?.display_name ?? "Customer"} — ${a.label}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  const driverLabel = new Map(drivers.map((d) => [d.id, d.label]));
  const vehicleLabel = new Map(vehicles.map((v) => [v.id, v.label]));

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/admin/routes" className="text-brand-green-700">← Routes</Link>
      </p>
      <PageHeader title={route.name} description={route.area ? `Area: ${route.area}` : undefined} action={<StatusBadge value={route.status} tones={{ active: "success", inactive: "neutral" }} />} />
      <FormMessage error={searchParams.error} saved={searchParams.saved} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-neutral-900">Stops</h2>
        <DataTable
          error={stopsError}
          rows={stops}
          emptyMessage={canManage ? "No stops yet. Add the first address below." : "This route has no stops."}
          columns={[
            { header: "#", cell: (s) => s.sequence_number, align: "right" },
            { header: "Service address", cell: (s) => s.service_addresses?.label ?? "—" },
            {
              header: "Customer",
              cell: (s) =>
                s.service_addresses?.customers ? (
                  <Link href={`/admin/customers/${s.service_addresses.customers.id}`} className="text-brand-green-700">
                    {s.service_addresses.customers.display_name}
                  </Link>
                ) : (
                  "—"
                ),
            },
            ...(canManage
              ? [
                  {
                    header: "",
                    cell: (s: { id: string }) => (
                      <form action={removeRouteStop}>
                        <input type="hidden" name="routeId" value={route.id} />
                        <input type="hidden" name="stopId" value={s.id} />
                        <button type="submit" className="text-sm font-medium text-red-700 hover:underline">Remove</button>
                      </form>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {canManage && (
          <Card>
            <CardContent>
              <form action={addRouteStop} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="routeId" value={route.id} />
                <div className="min-w-[16rem] flex-1">
                  <Field id="serviceAddressId" label="Add a stop">
                    <select id="serviceAddressId" name="serviceAddressId" required defaultValue="" className={selectClass}>
                      <option value="" disabled>{addressOptions.length ? "Choose customer and address…" : "No more active addresses to add"}</option>
                      {addressOptions.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Button type="submit" disabled={addressOptions.length === 0}>Add stop</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-neutral-900">Upcoming scheduled runs</h2>
        <DataTable
          error={assignmentsError}
          rows={assignments}
          emptyMessage={canManage ? "No runs scheduled. Pick a date, driver and vehicle below." : "No upcoming runs scheduled for this route."}
          columns={[
            { header: "Date", cell: (a) => formatDay(a.assignment_date) },
            {
              header: "Driver / vehicle",
              cell: (a) => {
                const leg = Array.isArray(a.driver_assignments) ? a.driver_assignments[0] : a.driver_assignments;
                if (!leg) return "—";
                return `${driverLabel.get(leg.driver_id) ?? "Driver"} · ${vehicleLabel.get(leg.vehicle_id) ?? "Vehicle"}`;
              },
            },
            {
              header: "Status",
              cell: (a) => (
                <StatusBadge
                  value={a.status}
                  tones={{ planned: "info", dispatched: "warning", in_progress: "warning", completed: "success", cancelled: "neutral" }}
                />
              ),
            },
            ...(canManage
              ? [
                  {
                    header: "",
                    cell: (a: { id: string; status: string }) =>
                      a.status === "planned" ? (
                        <form action={cancelRun}>
                          <input type="hidden" name="routeId" value={route.id} />
                          <input type="hidden" name="runId" value={a.id} />
                          <button type="submit" className="text-sm font-medium text-red-700 hover:underline">Cancel run</button>
                        </form>
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
        {canManage && (
          <Card>
            <CardHeader><CardTitle>Schedule a run</CardTitle></CardHeader>
            <CardContent>
              <form action={scheduleRun} className="grid gap-3 sm:grid-cols-4 sm:items-end">
                <input type="hidden" name="routeId" value={route.id} />
                <Field id="assignmentDate" label="Date">
                  <Input id="assignmentDate" name="assignmentDate" type="date" required min={today} defaultValue={today} />
                </Field>
                <Field id="driverId" label="Driver">
                  <select id="driverId" name="driverId" required defaultValue={route.default_driver_id ?? ""} className={selectClass}>
                    <option value="" disabled>Choose driver…</option>
                    {drivers.map((d) => (<option key={d.id} value={d.id}>{d.label}</option>))}
                  </select>
                </Field>
                <Field id="vehicleId" label="Vehicle">
                  <select id="vehicleId" name="vehicleId" required defaultValue={route.default_vehicle_id ?? ""} className={selectClass}>
                    <option value="" disabled>Choose vehicle…</option>
                    {vehicles.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
                  </select>
                </Field>
                <Button type="submit" disabled={drivers.length === 0 || vehicles.length === 0}>Schedule run</Button>
              </form>
              {(drivers.length === 0 || vehicles.length === 0) && (
                <p className="mt-3 text-xs text-neutral-500">
                  You need at least one active {drivers.length === 0 ? <Link href="/admin/drivers" className="text-brand-green-700">driver</Link> : null}
                  {drivers.length === 0 && vehicles.length === 0 ? " and one active " : null}
                  {vehicles.length === 0 ? <Link href="/admin/vehicles" className="text-brand-green-700">vehicle</Link> : null} before you can schedule a run.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {canManage && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-900">Edit route</h2>
          <Card>
            <CardContent>
              <form action={updateRoute}>
                <input type="hidden" name="id" value={route.id} />
                <RouteFields
                  drivers={drivers}
                  vehicles={vehicles}
                  submitLabel="Save changes"
                  values={{ name: route.name, area: route.area, defaultDriverId: route.default_driver_id, defaultVehicleId: route.default_vehicle_id, status: route.status }}
                />
              </form>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
