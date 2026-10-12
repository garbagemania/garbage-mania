import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { activeDriverOptions, activeVehicleOptions } from "@/lib/admin/lookups";
import { PageHeader } from "@/components/admin/page-kit";
import { FormMessage } from "@/components/admin/form-kit";
import { RouteFields } from "@/components/admin/route-form";
import { Card, CardContent } from "@/components/ui/card";
import { createRoute } from "../actions";

export const metadata = { title: "New route · Garbage Mania" };

export default async function NewRoutePage({ searchParams }: { searchParams: { error?: string } }) {
  await requirePageRoles(["super_admin", "operations_manager"]);
  const supabase = createSupabaseServerClient();
  const [drivers, vehicles] = await Promise.all([activeDriverOptions(supabase), activeVehicleOptions(supabase)]);

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm"><Link href="/admin/routes" className="text-brand-green-700">← Routes</Link></p>
      <PageHeader title="New route" description="Create the route first, then add its stops and schedule runs on the next screen." />
      <FormMessage error={searchParams.error} />
      <Card>
        <CardContent>
          <form action={createRoute}>
            <RouteFields drivers={drivers} vehicles={vehicles} submitLabel="Create route" />
          </form>
          {drivers.length === 0 && (
            <p className="mt-4 text-xs text-neutral-500">
              No active drivers yet. A super admin can add one from <Link href="/admin/drivers" className="text-brand-green-700">Drivers</Link>; you can also set the default driver later.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
