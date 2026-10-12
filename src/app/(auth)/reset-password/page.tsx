import { redirect } from "next/navigation";
import { resetPassword } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/auth/submit-button";
import { PasswordInput } from "@/components/auth/password-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Choose a new password · Garbage Mania" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  // Only reachable through the emailed link (which signs the person in briefly).
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?error=${encodeURIComponent("That link has expired. Please request a new one.")}`);
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-neutral-600">Use at least 8 characters.</p>
        </div>

        {params.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {params.error}
          </p>
        )}

        <form action={resetPassword} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-neutral-600">
              New password
            </label>
            <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-neutral-600">
              Confirm new password
            </label>
            <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={8} />
          </div>
          <SubmitButton pendingLabel="Saving…" className="w-full">
            Update password
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
