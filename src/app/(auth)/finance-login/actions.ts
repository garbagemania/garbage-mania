"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { FINANCE_HOME_PATH, financeCanAccessPath } from "@/types/roles";

const back: (message: string) => never = (message) =>
  redirect(`/finance-login?error=${encodeURIComponent(message)}`);

/**
 * Sign-in for the accountant. Same Supabase Auth email + password as the
 * main /login, but it ONLY lets a `finance` account through: the role is
 * read from the database after sign-in (never from anything the browser
 * sends), and any other role is signed straight back out. Middleware
 * (src/middleware.ts) then confines the finance role to the finance
 * screens, and Postgres RLS remains the final boundary underneath.
 */
export async function financeLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rawRedirect = String(formData.get("redirectTo") ?? "");
  const redirectTo = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes("\\") ? rawRedirect : "";

  if (!email || !password) back("Email and password are required.");

  const supabase = createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) back("Incorrect email or password.");

  const user = await getCurrentUser();

  if (!user || user.role !== "finance" || user.kind !== "staff") {
    await supabase.auth.signOut();
    back("This sign-in is for the finance team only.");
  }

  if (user.status !== "active" || user.staffProfile?.isActive === false) {
    await supabase.auth.signOut();
    back("This account is not active. Please contact Garbage Mania.");
  }

  // Only honor a return link that stays inside the finance screens.
  redirect(redirectTo.startsWith("/") && financeCanAccessPath(redirectTo) ? redirectTo : FINANCE_HOME_PATH);
}
