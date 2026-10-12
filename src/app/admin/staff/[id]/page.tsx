import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient, createSupabaseAuthAdminClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader, StatusBadge } from "@/components/admin/page-kit";
import { PasswordField } from "@/components/admin/password-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ASSIGNABLE_STAFF_ROLES, STAFF_MANAGERS } from "@/types/roles";
import { STAFF_ROLE_LABELS } from "@/config/staff";
import { formatDateTime, formatDay } from "@/lib/format";
import { changeStaffRole, resetStaffPassword, setStaffStatus } from "../actions";

const label = "mb-1 block text-xs font-medium text-neutral-600";
const STATUS_TONES = { active: "success", suspended: "warning", disabled: "danger" } as const;

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; error?: string };
}) {
  const me = await requirePageRoles([...STAFF_MANAGERS]);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const supabase = createSupabaseServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, phone, status, role_id, kind, last_seen_at, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!profile || profile.kind !== "staff") notFound();

  const [{ data: role }, { data: staff }, { data: driver }] = await Promise.all([
    supabase.from("roles").select("code").eq("id", profile.role_id).maybeSingle(),
    supabase.from("staff_profiles").select("employee_number, department, hire_date").eq("id", profile.id).maybeSingle(),
    supabase.from("drivers").select("license_number, license_expiry, status").eq("id", profile.id).maybeSingle(),
  ]);

  let email: string | null = null;
  try {
    const { data } = await createSupabaseAuthAdminClient().auth.admin.getUserById(profile.id);
    email = data?.user?.email ?? null;
  } catch {
    // Service key not configured: omit the email.
  }

  const isSelf = profile.id === me.id;
  const roleCode = role?.code ?? "";
  const suspended = profile.status !== "active";

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={profile.full_name}
        description={`${STAFF_ROLE_LABELS[roleCode] ?? roleCode}${isSelf ? " · this is you" : ""}`}
        action={
          <Link href="/admin/staff">
            <Button variant="outline">Back to staff</Button>
          </Link>
        }
      />

      {searchParams.saved && (
        <p role="status" className="rounded-md bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">{searchParams.saved}</p>
      )}
      {searchParams.error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{searchParams.error}</p>
      )}

      <Card>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-neutral-500">Email</dt><dd>{email ?? "—"}</dd></div>
            <div><dt className="text-xs uppercase text-neutral-500">Phone</dt><dd>{profile.phone ?? "—"}</dd></div>
            <div><dt className="text-xs uppercase text-neutral-500">Employee no.</dt><dd>{staff?.employee_number ?? "—"}</dd></div>
            <div><dt className="text-xs uppercase text-neutral-500">Department</dt><dd>{staff?.department ?? "—"}</dd></div>
            <div><dt className="text-xs uppercase text-neutral-500">Status</dt><dd><StatusBadge value={profile.status} tones={STATUS_TONES} /></dd></div>
            <div><dt className="text-xs uppercase text-neutral-500">Last seen</dt><dd>{profile.last_seen_at ? formatDateTime(profile.last_seen_at) : "—"}</dd></div>
            {driver && (
              <>
                <div><dt className="text-xs uppercase text-neutral-500">Licence</dt><dd>{driver.license_number}</dd></div>
                <div><dt className="text-xs uppercase text-neutral-500">Licence expiry</dt><dd>{formatDay(driver.license_expiry)} · {driver.status}</dd></div>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {isSelf ? (
        <Card>
          <CardContent className="text-sm text-neutral-600">
            You cannot change your own role, suspend yourself, or reset your own password from here.
            Use <Link className="text-brand-green-700" href="/admin/account">My password</Link> to change your password.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>Role</CardTitle></CardHeader>
            <CardContent>
              <form action={changeStaffRole} className="space-y-4">
                <input type="hidden" name="userId" value={profile.id} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="role" className={label}>New role</label>
                    <select id="role" name="role" defaultValue={roleCode} className="h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm">
                      {ASSIGNABLE_STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </div>
                  {!driver && (
                    <>
                      <div>
                        <label htmlFor="licenseNumber" className={label}>Licence no. (if making a driver)</label>
                        <Input id="licenseNumber" name="licenseNumber" maxLength={50} />
                      </div>
                      <div>
                        <label htmlFor="licenseExpiry" className={label}>Licence expiry</label>
                        <Input id="licenseExpiry" name="licenseExpiry" type="date" />
                      </div>
                    </>
                  )}
                </div>
                <p className="text-xs text-neutral-500">
                  The new role takes effect on their next page load. Moving someone off the driver role keeps their collection history and marks the driver record inactive.
                </p>
                <Button type="submit">Save role</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{suspended ? "Reactivate account" : "Suspend account"}</CardTitle></CardHeader>
            <CardContent>
              <form action={setStaffStatus} className="space-y-3">
                <input type="hidden" name="userId" value={profile.id} />
                <input type="hidden" name="intent" value={suspended ? "reactivate" : "suspend"} />
                <p className="text-sm text-neutral-600">
                  {suspended
                    ? "Lets this person sign in again."
                    : "Blocks sign-in straight away and on every page they open next. Nothing is deleted; you can reactivate them later."}
                </p>
                <Button type="submit" variant={suspended ? "primary" : "danger"}>
                  {suspended ? "Reactivate" : "Suspend"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Reset password</CardTitle></CardHeader>
            <CardContent>
              <form action={resetStaffPassword} className="space-y-3">
                <input type="hidden" name="userId" value={profile.id} />
                <PasswordField label="New password" />
                <Button type="submit" variant="outline">Set new password</Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
