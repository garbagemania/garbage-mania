"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Emails a password-reset link. The response is deliberately identical
 * whether or not the address belongs to an account, so this form can't be
 * used to discover who has an account.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !email.includes("@")) {
    redirect(`/forgot-password?error=${encodeURIComponent("Enter the email address you signed up with.")}`);
  }

  const supabase = createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  redirect("/forgot-password?sent=1");
}
