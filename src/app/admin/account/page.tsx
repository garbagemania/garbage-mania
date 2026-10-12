import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AREA_ACCESS } from "@/types/roles";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation/staff";
import { changeOwnPassword } from "./actions";
import { TwoStepSetup } from "@/components/auth/two-step-setup";

const label = "mb-1 block text-xs font-medium text-neutral-600";

export default async function AccountPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const user = await requirePageRoles([...AREA_ACCESS.admin]);

  return (
    <div className="max-w-md space-y-6">
      <PageHeader title="My password" description={`Signed in as ${user.email ?? user.fullName ?? "you"}.`} />

      {searchParams.saved && (
        <p role="status" className="rounded-md bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">{searchParams.saved}</p>
      )}
      {searchParams.error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{searchParams.error}</p>
      )}

      <Card>
        <CardContent>
          <form action={changeOwnPassword} className="space-y-4">
            <div>
              <label htmlFor="password" className={label}>New password (min {MIN_PASSWORD_LENGTH} characters)</label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={72} />
            </div>
            <div>
              <label htmlFor="confirm" className={label}>Repeat new password</label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={72} />
            </div>
            <Button type="submit">Change password</Button>
          </form>
        </CardContent>
      </Card>

      <TwoStepSetup />
    </div>
  );
}
