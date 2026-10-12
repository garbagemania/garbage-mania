"use server";

import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";

const schema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  note: z.string().trim().max(500, "Note is too long (max 500 characters)").optional(),
});

function back(params: Record<string, string>): never {
  const safe = params.error ? { ...params, error: friendlyError(params.error) } : params;
  redirect(`/admin/requests?${new URLSearchParams(safe).toString()}`);
}

/**
 * Approve (creates a one-off collection) or reject (with a reason) a
 * customer's collection request. The database function
 * review_collection_request() (migration 023) is what actually decides and
 * re-checks the role; this is the friendly front door.
 * Untyped client: run `npm run db:types` after applying migration 023.
 */
export async function reviewRequest(formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin", "admin", "operations_manager"]);

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
  const v = parsed.data;

  const db = createSupabaseServerClient() as unknown as SupabaseClient;
  const { error } = await db.rpc("review_collection_request", {
    p_request_id: v.requestId,
    p_approve: v.decision === "approve",
    p_scheduled_date: v.scheduledDate || null,
    p_note: v.note || null,
  });
  if (error) back({ error: error.message });

  revalidatePath("/admin/requests");
  revalidatePath("/admin/collections");
  revalidatePath("/portal/requests");
  back({ saved: v.decision === "approve" ? "Approved - a collection has been scheduled." : "Request rejected." });
}
