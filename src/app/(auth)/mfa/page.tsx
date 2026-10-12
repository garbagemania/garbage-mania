import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { MfaChallenge } from "@/components/auth/mfa-challenge";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Two-step login · Garbage Mania" };
export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: { redirectTo?: string } }) {
  const raw = searchParams.redirectTo ?? "";
  const redirectTo = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "/admin";

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Nothing to do if there is no second step to complete.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") redirect(redirectTo);

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Two-step login</h1>
          <p className="mt-1 text-sm text-neutral-600">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <MfaChallenge redirectTo={redirectTo} />
        <p className="text-center text-sm">
          <Link href="/login" className="font-medium text-brand-green-700 hover:underline">Use a different account</Link>
        </p>
      </CardContent>
    </Card>
  );
}
