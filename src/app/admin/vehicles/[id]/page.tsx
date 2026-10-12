import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Field, FormMessage, selectClass } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateVehicle } from "../actions";

export default async function EditVehiclePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; saved?: string };
}) {
  await requirePageRoles(["super_admin", "operations_manager"]);
  const supabase = createSupabaseServerClient();
  const { data: v } = await supabase
    .from("vehicles")
    .select("id, registration_number, vehicle_type, capacity_kg, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!v) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm"><Link href="/admin/vehicles" className="text-brand-green-700">← Vehicles</Link></p>
      <PageHeader title={v.registration_number} description="Edit vehicle details or change its status." />
      <FormMessage error={searchParams.error} saved={searchParams.saved} />
      <Card>
        <CardContent>
          <form action={updateVehicle} className="space-y-4">
            <input type="hidden" name="id" value={v.id} />
            <Field id="registrationNumber" label="Registration number">
              <Input id="registrationNumber" name="registrationNumber" required maxLength={20} defaultValue={v.registration_number} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="vehicleType" label="Type (optional)">
                <Input id="vehicleType" name="vehicleType" maxLength={60} defaultValue={v.vehicle_type ?? ""} />
              </Field>
              <Field id="capacityKg" label="Capacity in kg (optional)">
                <Input id="capacityKg" name="capacityKg" type="number" min={1} step="0.01" defaultValue={v.capacity_kg ?? ""} />
              </Field>
            </div>
            <Field id="status" label="Status">
              <select id="status" name="status" defaultValue={v.status} className={selectClass}>
                <option value="active">Active</option>
                <option value="in_maintenance">In maintenance</option>
                <option value="out_of_service">Out of service</option>
              </select>
            </Field>
            <Button type="submit">Save changes</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
