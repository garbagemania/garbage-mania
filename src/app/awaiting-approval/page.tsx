import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

export default async function AwaitingApprovalPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: status } = await supabase.rpc("customer_approval_status");
  if (status === "approved") redirect("/portal");
  // Signed in but not a customer at all (e.g. staff): nothing to wait for here.
  if (status === null || status === undefined) redirect("/login");

  const rejected = status === "rejected";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <Logo size="lg" priority />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-neutral-900">
          {rejected ? "Application not approved" : "Awaiting approval"}
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          {rejected
            ? "Your application was not approved. Please contact Garbage Mania if you think this is a mistake."
            : "Your application is being reviewed by Garbage Mania. You'll be able to use your account as soon as it is approved."}
        </p>
        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
