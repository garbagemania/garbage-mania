"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";
import { contractFormSchema, subscriptionFormSchema, subscriptionStatusSchema } from "@/lib/validation/subscriptions";

const CAN_MANAGE = ["super_admin", "admin"] as const;

function generateContractNumber() {
  return `CT-${Date.now().toString(36).toUpperCase()}`;
}

export async function createContract(customerId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const parsed = contractFormSchema.safeParse({
    billingTerms: formData.get("billingTerms"),
    startDate: formData.get("startDate"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/subscriptions/new?customerId=${customerId}&error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Invalid contract",
      )}`,
    );
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("contracts").insert({
    customer_id: customerId,
    contract_number: generateContractNumber(),
    start_date: values.startDate,
    billing_terms: values.billingTerms,
    status: "active",
  });

  if (error) {
    redirect(`/admin/subscriptions/new?customerId=${customerId}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/subscriptions/new");
  redirect(`/admin/subscriptions/new?customerId=${customerId}`);
}

export async function createSubscription(customerId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const parsed = subscriptionFormSchema.safeParse({
    contractId: formData.get("contractId"),
    serviceAddressId: formData.get("serviceAddressId"),
    servicePlanId: formData.get("servicePlanId"),
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/subscriptions/new?customerId=${customerId}&error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Invalid subscription",
      )}`,
    );
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      contract_id: values.contractId,
      // Overwritten by sync_subscription_customer (003_commercial.sql) -
      // included only to satisfy the generated Insert type's NOT NULL
      // customer_id column; the trigger is the actual source of truth.
      customer_id: customerId,
      service_address_id: values.serviceAddressId,
      service_plan_id: values.servicePlanId,
      frequency: values.frequency,
      start_date: values.startDate,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/admin/subscriptions/new?customerId=${customerId}&error=${encodeURIComponent(
        error?.message ?? "Could not create subscription",
      )}`,
    );
  }

  revalidatePath("/admin/subscriptions");
  redirect(`/admin/subscriptions/${data.id}`);
}

export async function changeSubscriptionStatus(subscriptionId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const parsed = subscriptionStatusSchema.safeParse(formData.get("status"));
  if (!parsed.success) {
    redirect(`/admin/subscriptions/${subscriptionId}?error=${encodeURIComponent("Invalid status")}`);
  }

  const supabase = createSupabaseServerClient();
  // Goes through the database's own atomic transition function (003_commercial.sql)
  // rather than a raw UPDATE - it both enforces the approved status graph
  // (via the enforce_status_transition trigger) and records the change in
  // subscription_history in the same call. This function is SECURITY
  // INVOKER, so it still runs under the caller's own RLS - the
  // requireStaffRole() check above is a fast, friendly failure; RLS is
  // still what actually decides whether the underlying UPDATE/INSERT
  // succeed.
  const { error } = await supabase.rpc("transition_subscription_status", {
    p_subscription_id: subscriptionId,
    p_new_status: parsed.data,
    p_changed_by: user.id,
  });

  if (error) {
    redirect(`/admin/subscriptions/${subscriptionId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/subscriptions/${subscriptionId}`);
  redirect(`/admin/subscriptions/${subscriptionId}`);
}
