import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Field, FormMessage, selectClass } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateDriver } from "../actions";

export const metadata = { title: "Edit driver · Garbage Mania" };

export default async function EditDriverPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  await requirePageRoles(["super_admin", "operations_manager"]);
  const supabase = createSupabaseServerClient();

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, license_number, license_expiry, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!driver) notFound();

  const [{ data: profile }, { data: staff }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", driver.id).maybeSingle(),
    supabase.from("staff_profiles").select("employee_number").eq("id", driver.id).maybeSingle(),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm"><Link href="/admin/drivers" className="text-brand-green-700">← Drivers</Link></p>
      <PageHeader
        title={profile?.full_name ?? "Driver"}
        description={[staff?.employee_number, profile?.phone].filter(Boolean).join(" · ") || undefined}
      />
      <FormMessage error={searchParams.error} />
      <Card>
        <CardContent>
          <form action={updateDriver} className="space-y-4">
            <input type="hidden" name="id" value={driver.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="licenseNumber" label="Licence number">
                <Input id="licenseNumber" name="licenseNumber" required maxLength={50} defaultValue={driver.license_number} />
              </Field>
              <Field id="licenseExpiry" label="Licence expiry">
                <Input id="licenseExpiry" name="licenseExpiry" type="date" required defaultValue={driver.license_expiry} />
              </Field>
            </div>
            <Field id="status" label="Status" hint="Only active drivers can be put on a run. Suspending a driver does not remove their login.">
              <select id="status" name="status" defaultValue={driver.status} className={selectClass}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <Button type="submit">Save changes</Button>
          </form>
          <p className="mt-4 text-xs text-neutral-500">
            Name, phone and login are managed by a super admin under <Link href={`/admin/staff/${driver.id}`} className="text-brand-green-700">Staff</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
