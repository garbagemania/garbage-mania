import Link from "next/link";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Field, FormMessage, selectClass } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createVehicle } from "../actions";

export const metadata = { title: "Add vehicle · Garbage Mania" };

export default async function NewVehiclePage({ searchParams }: { searchParams: { error?: string } }) {
  await requirePageRoles(["super_admin", "operations_manager"]);

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm"><Link href="/admin/vehicles" className="text-brand-green-700">← Vehicles</Link></p>
      <PageHeader title="Add vehicle" description="Register a vehicle so it can be assigned to routes." />
      <FormMessage error={searchParams.error} />
      <Card>
        <CardContent>
          <form action={createVehicle} className="space-y-4">
            <Field id="registrationNumber" label="Registration number" hint="e.g. KDA 123A. Saved in capitals.">
              <Input id="registrationNumber" name="registrationNumber" required maxLength={20} placeholder="KDA 123A" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="vehicleType" label="Type (optional)">
                <Input id="vehicleType" name="vehicleType" maxLength={60} placeholder="Compactor truck, pickup…" />
              </Field>
              <Field id="capacityKg" label="Capacity in kg (optional)">
                <Input id="capacityKg" name="capacityKg" type="number" min={1} step="0.01" placeholder="3500" />
              </Field>
            </div>
            <Field id="status" label="Status">
              <select id="status" name="status" defaultValue="active" className={selectClass}>
                <option value="active">Active</option>
                <option value="in_maintenance">In maintenance</option>
                <option value="out_of_service">Out of service</option>
              </select>
            </Field>
            <Button type="submit">Add vehicle</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
