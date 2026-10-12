import { Field, selectClass } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface Option {
  id: string;
  label: string;
}

/** Fields shared by "New route" and "Edit route". The caller supplies the <form> and server action. */
export function RouteFields({
  drivers,
  vehicles,
  values,
  submitLabel,
}: {
  drivers: Option[];
  vehicles: Option[];
  values?: { name?: string; area?: string | null; defaultDriverId?: string | null; defaultVehicleId?: string | null; status?: string };
  submitLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Route name">
          <Input id="name" name="name" required maxLength={80} defaultValue={values?.name ?? ""} placeholder="e.g. Westlands Monday" />
        </Field>
        <Field id="area" label="Area (optional)">
          <Input id="area" name="area" maxLength={80} defaultValue={values?.area ?? ""} placeholder="e.g. Westlands" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="defaultDriverId" label="Default driver (optional)">
          <select id="defaultDriverId" name="defaultDriverId" defaultValue={values?.defaultDriverId ?? ""} className={selectClass}>
            <option value="">— None —</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </Field>
        <Field id="defaultVehicleId" label="Default vehicle (optional)">
          <select id="defaultVehicleId" name="defaultVehicleId" defaultValue={values?.defaultVehicleId ?? ""} className={selectClass}>
            <option value="">— None —</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="status" label="Status">
        <select id="status" name="status" defaultValue={values?.status ?? "active"} className={selectClass}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
      <Button type="submit">{submitLabel}</Button>
    </div>
  );
}
