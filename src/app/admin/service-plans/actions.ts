"use server";

import { todayNairobi } from "@/lib/portal/dates";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";
import { servicePlanFormSchema, servicePlanPriceFormSchema } from "@/lib/validation/service-plans";

const CAN_MANAGE = ["super_admin", "admin"] as const;

export async function createServicePlan(formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const parsed = servicePlanFormSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    wasteType: formData.get("wasteType"),
    containerType: formData.get("containerType") ?? undefined,
    defaultFrequency: formData.get("defaultFrequency"),
    priceKes: formData.get("priceKes"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/service-plans/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  }

  const values = parsed.data;
  const priceCents = Math.round(values.priceKes * 100);
  const supabase = createSupabaseServerClient();

  const { data: plan, error: planError } = await supabase
    .from("service_plans")
    .insert({
      code: values.code,
      name: values.name,
      waste_type: values.wasteType,
      container_type: values.containerType || null,
      default_frequency: values.defaultFrequency,
    })
    .select("id")
    .single();

  if (planError || !plan) {
    redirect(`/admin/service-plans/new?error=${encodeURIComponent(planError?.message ?? "Could not create plan")}`);
  }

  const today = todayNairobi();
  const { error: priceError } = await supabase.from("service_plan_prices").insert({
    service_plan_id: plan.id,
    price_cents: priceCents,
    effective_from: today,
  });

  if (priceError) {
    // The plan itself was created successfully - surface this precisely
    // rather than implying the whole operation failed.
    redirect(
      `/admin/service-plans/${plan.id}?error=${encodeURIComponent(
        `Plan created, but setting its initial price failed: ${priceError.message}`,
      )}`,
    );
  }

  revalidatePath("/admin/service-plans");
  redirect(`/admin/service-plans/${plan.id}`);
}

export async function setServicePlanActive(planId: string, isActive: boolean) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("service_plans").update({ is_active: isActive }).eq("id", planId);

  if (error) {
    redirect(`/admin/service-plans/${planId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/service-plans/${planId}`);
  revalidatePath("/admin/service-plans");
  redirect(`/admin/service-plans/${planId}`);
}

export async function addServicePlanPrice(planId: string, formData: FormData) {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...CAN_MANAGE]);

  const parsed = servicePlanPriceFormSchema.safeParse({
    priceKes: formData.get("priceKes"),
    effectiveFrom: formData.get("effectiveFrom"),
  });

  if (!parsed.success) {
    redirect(
      `/admin/service-plans/${planId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid price")}`,
    );
  }

  const values = parsed.data;
  const supabase = createSupabaseServerClient();

  // Atomic: closes the current price and opens the new one in one
  // transaction - see supabase/migrations/012_admin_phase_support.sql for
  // why this is an RPC rather than two separate supabase-js calls.
  const { error } = await supabase.rpc("set_service_plan_price", {
    p_service_plan_id: planId,
    p_price_cents: Math.round(values.priceKes * 100),
    p_effective_from: values.effectiveFrom,
  });

  if (error) {
    redirect(`/admin/service-plans/${planId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/service-plans/${planId}`);
  redirect(`/admin/service-plans/${planId}`);
}
