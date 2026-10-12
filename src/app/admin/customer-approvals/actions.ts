"use server";

import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";

const reviewSchema = z.object({
  customerId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000, "Note is too long (max 1000 characters)").optional().or(z.literal("")),
});

function back(params: Record<string, string>): never {
  const safe = params.error ? { ...params, error: friendlyError(params.error) } : params;
  redirect(`/admin/customer-approvals?${new URLSearchParams(safe).toString()}`);
}

/**
 * Approve or reject a customer sign-up. Super admin only, enforced twice:
 * here (fail fast) and inside review_customer_signup() in the database
 * (017_customer_signup_approval.sql), which is what actually decides.
 */
export async function reviewSignup(formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin"]);

  const parsed = reviewSchema.safeParse({
    customerId: formData.get("customerId"),
    decision: formData.get("decision"),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) back({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
  const v = parsed.data;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("review_customer_signup", {
    p_customer_id: v.customerId,
    p_approve: v.decision === "approve",
    p_note: v.note || undefined,
  });
  if (error) back({ error: error.message });

  revalidatePath("/admin/customer-approvals");
  back({ saved: v.decision === "approve" ? "approved" : "rejected", status: "pending" });
}
