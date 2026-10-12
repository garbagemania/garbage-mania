"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";
import { z } from "zod";

const statusSchema = z.enum(["assigned", "in_progress", "completed", "failed", "cancelled", "rescheduled"]);
const reasonSchema = z
  .enum([
    "gate_locked",
    "customer_absent",
    "bin_not_out",
    "customer_cancelled",
    "operational_cancelled",
    "weather",
    "vehicle_issue",
    "other",
  ])
  .optional();

/**
 * Goes through transition_collection_status() (005_operations.sql) rather
 * than a raw UPDATE - it enforces the approved status graph (Decision 7,
 * including the assigned/scheduled -> cancelled paths) via the
 * enforce_status_transition trigger, requires a reason_code for
 * failed/cancelled, and records the change in collection_status_events
 * atomically. This function is SECURITY INVOKER: the caller's own RLS
 * (collections_update_ops - super_admin/operations_manager only, in
 * 011_rls_policies.sql) is what actually gates this, not the
 * requireStaffRole() check below on its own.
 */
export async function changeCollectionStatus(collectionId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, ["super_admin", "operations_manager"]);

  const status = statusSchema.safeParse(formData.get("status"));
  const reason = reasonSchema.safeParse(formData.get("reasonCode") || undefined);

  if (!status.success) {
    redirect(`/admin/collections/${collectionId}?error=${encodeURIComponent("Invalid status")}`);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("transition_collection_status", {
    p_collection_id: collectionId,
    p_new_status: status.data,
    p_reason_code: reason.success ? reason.data : undefined,
    p_actor_id: user.id,
  });

  if (error) {
    redirect(`/admin/collections/${collectionId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/collections/${collectionId}`);
  revalidatePath("/admin/collections");
  redirect(`/admin/collections/${collectionId}`);
}
