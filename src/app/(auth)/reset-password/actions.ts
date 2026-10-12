"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function resetPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?error=${encodeURIComponent("That link has expired. Please request a new one.")}`);
  }

  if (password.length < 8 || password.length > 72) {
    redirect(`/reset-password?error=${encodeURIComponent("Password must be 8 to 72 characters.")}`);
  }
  if (password !== confirm) {
    redirect(`/reset-password?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent("Could not update your password. Please try again.")}`);
  }

  // End the recovery session so the person signs in with the new password.
  await supabase.auth.signOut();
  redirect(`/login?message=${encodeURIComponent("Password updated. Please sign in with your new password.")}`);
}
