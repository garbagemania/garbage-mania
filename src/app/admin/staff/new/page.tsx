import Link from "next/link";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { PasswordField } from "@/components/admin/password-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ASSIGNABLE_STAFF_ROLES, STAFF_MANAGERS } from "@/types/roles";
import { createStaff } from "../actions";
import { STAFF_ROLE_LABELS as ROLE_LABELS } from "@/config/staff";

const label = "mb-1 block text-xs font-medium text-neutral-600";

export default async function NewStaffPage({ searchParams }: { searchParams: { error?: string; role?: string } }) {
  await requirePageRoles([...STAFF_MANAGERS]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Add staff member" description="Creates their login and gives them a role. They can change the password after signing in." />

      {searchParams.error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <Card>
        <CardContent>
          <form action={createStaff} className="space-y-4">
            <div>
              <label htmlFor="fullName" className={label}>Full name</label>
              <Input id="fullName" name="fullName" required maxLength={120} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="email" className={label}>Email (their sign-in)</label>
                <Input id="email" name="email" type="email" required autoComplete="off" />
              </div>
              <div>
                <label htmlFor="phone" className={label}>Phone (optional)</label>
                <Input id="phone" name="phone" placeholder="0712345678" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="role" className={label}>Role</label>
                <select id="role" name="role" required defaultValue={(ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(searchParams.role ?? "") ? searchParams.role : ""} className="h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm">
                  <option value="" disabled>Choose a role</option>
                  {ASSIGNABLE_STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="department" className={label}>Department (optional)</label>
                <Input id="department" name="department" maxLength={80} />
              </div>
            </div>
            <div>
              <label htmlFor="employeeNumber" className={label}>Employee number (optional, auto-assigned if blank)</label>
              <Input id="employeeNumber" name="employeeNumber" maxLength={30} placeholder="GM-0007" />
            </div>

            <fieldset className="space-y-4 rounded-md border border-neutral-200 p-4">
              <legend className="px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Drivers only</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="licenseNumber" className={label}>Licence number</label>
                  <Input id="licenseNumber" name="licenseNumber" maxLength={50} />
                </div>
                <div>
                  <label htmlFor="licenseExpiry" className={label}>Licence expiry</label>
                  <Input id="licenseExpiry" name="licenseExpiry" type="date" />
                </div>
              </div>
            </fieldset>

            <PasswordField label="Initial password" />

            <div className="flex gap-3">
              <Button type="submit">Create account</Button>
              <Link href="/admin/staff"><Button type="button" variant="outline">Cancel</Button></Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
