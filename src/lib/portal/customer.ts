import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Identity for every /portal page. `customerId` comes from the signed-in
 * user's own `customer_profiles` row (itself RLS-scoped), never from a URL
 * or form field. It is used to add an explicit `.eq("customer_id", …)` to
 * queries as defense in depth - RLS remains the real isolation boundary.
 *
 * `customerId` is null for a signed-in user with no linked customer record
 * (e.g. a super_admin, who is allowed into /portal but is not a customer).
 */
export async function getPortalContext() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=/portal");
  const supabase = createSupabaseServerClient();
  return { supabase, user, customerId: user.customerProfile?.customerId ?? null };
}

/** Normalise a PostgREST embed, which may come back as an object or a one-element array. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function messageFrom(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Something went wrong. Please try again.";
}

/**
 * The signed-in customer's approval status ("pending" | "approved" |
 * "rejected"), or null when the login has no customer link (e.g. staff).
 * Read through a SECURITY DEFINER function because RLS hides the customers
 * row from a customer who is not approved yet.
 */
export async function getCustomerApproval(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc("customer_approval_status");
  return data ?? null;
}
