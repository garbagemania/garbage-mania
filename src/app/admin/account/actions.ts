"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { changeOwnPasswordSchema } from "@/lib/validation/staff";

/**
 * Lets any signed-in staff member (including the accountant) change their
 * own password. Uses their own session; no service role involved.
 */
export async function changeOwnPassword(formData: FormData) {
  const here = "/admin/account";
  await requireAuthenticatedUser();

  const parsed = changeOwnPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    redirect(`${here}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the password.")}`);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect(`${here}?error=${encodeURIComponent(error.message)}`);

  redirect(`${here}?saved=${encodeURIComponent("Password changed.")}`);
}
