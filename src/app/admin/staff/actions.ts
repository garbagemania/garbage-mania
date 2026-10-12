"use server";

import { friendlyError } from "@/lib/friendly-error";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseAuthAdminClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole, AuthorizationError } from "@/lib/auth/rbac";
import { STAFF_MANAGERS } from "@/types/roles";
import {
  changeRoleSchema,
  createStaffSchema,
  resetPasswordSchema,
  staffStatusSchema,
} from "@/lib/validation/staff";

/**
 * Staff management. Super admin only, enforced three times: here (fail
 * fast), in each database function (require_super_admin(), migration 022 -
 * which is what actually decides, together with the self-change and
 * last-super-admin rules) and by the guard trigger on `profiles`.
 *
 * Business rows are written through the signed-in user's own session so the
 * audit log records the real actor. The service-role client is used ONLY
 * for the Auth admin API (create login, ban, set password).
 *
 * `db` is untyped because src/types/database.ts has not been regenerated for
 * migration 022 yet (run `npm run db:types`).
 */
type Db = SupabaseClient;

function back(path: string, params: Record<string, string>): never {
  const safe = params.error ? { ...params, error: friendlyError(params.error) } : params;
  redirect(`${path}?${new URLSearchParams(safe).toString()}`);
}

async function ctx(here: string) {
  const user = await requireAuthenticatedUser();
  try {
    requireStaffRole(user, [...STAFF_MANAGERS]);
  } catch (e) {
    if (e instanceof AuthorizationError) back(here, { error: "Only a super admin can manage staff." });
    throw e;
  }
  return { user, db: createSupabaseServerClient() as unknown as Db };
}

function firstIssue(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

/* ------------------------------------------------------------- create */

export async function createStaff(formData: FormData) {
  const here = "/admin/staff/new";
  const { db } = await ctx(here);

  const parsed = createStaffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(here, { error: firstIssue(parsed.error, "Check the staff details.") });
  const v = parsed.data;

  const auth = createSupabaseAuthAdminClient();

  // provisioning: "staff" makes the signup trigger skip customer provisioning.
  const { data: created, error: createError } = await auth.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
    user_metadata: { provisioning: "staff", full_name: v.fullName },
  });
  if (createError || !created?.user) {
    const msg = /already|registered|exists/i.test(createError?.message ?? "")
      ? "A login with that email already exists."
      : `Could not create the login: ${createError?.message ?? "unknown error"}`;
    back(here, { error: msg });
  }
  const userId = created.user.id;

  const { error } = await db.rpc("provision_staff", {
    p_user_id: userId,
    p_full_name: v.fullName,
    p_phone: v.phone ?? null,
    p_role: v.role,
    p_employee_number: v.employeeNumber ?? null,
    p_department: v.department ?? null,
    p_license_number: v.licenseNumber ?? null,
    p_license_expiry: v.licenseExpiry ?? null,
  });
  if (error) {
    // Nothing half-made: remove the login so a retry starts clean.
    await auth.auth.admin.deleteUser(userId);
    const msg = /staff_profiles_employee_number/i.test(error.message)
      ? "That employee number is already in use."
      : error.message;
    back(here, { error: msg });
  }

  revalidatePath("/admin/staff");
  back("/admin/staff", { saved: `${v.fullName} can now sign in with ${v.email}.` });
}

/* -------------------------------------------------------- change role */

export async function changeStaffRole(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const here = `/admin/staff/${userId}`;
  const { db } = await ctx(here);

  const parsed = changeRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(here, { error: firstIssue(parsed.error, "Check the role details.") });
  const v = parsed.data;

  const { error } = await db.rpc("set_staff_role", {
    p_user_id: v.userId,
    p_role: v.role,
    p_license_number: v.licenseNumber ?? null,
    p_license_expiry: v.licenseExpiry ?? null,
  });
  if (error) back(here, { error: error.message });

  revalidatePath("/admin/staff");
  revalidatePath(here);
  back(here, { saved: "Role updated. It applies the next time they open a page." });
}

/* ------------------------------------------------- suspend / reactivate */

export async function setStaffStatus(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const here = `/admin/staff/${userId}`;
  const { db } = await ctx(here);

  const parsed = staffStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(here, { error: firstIssue(parsed.error, "Invalid request.") });
  const { intent } = parsed.data;
  const suspend = intent === "suspend";

  // Database first: it enforces the self-change and last-super-admin rules.
  const { error } = await db.rpc("set_staff_status", { p_user_id: parsed.data.userId, p_suspend: suspend });
  if (error) back(here, { error: error.message });

  // Then the login itself: a ban stops new sign-ins and token refreshes.
  // (Middleware also blocks any non-active profile on its next request.)
  const { error: banError } = await createSupabaseAuthAdminClient().auth.admin.updateUserById(parsed.data.userId, {
    ban_duration: suspend ? "876000h" : "none",
  });
  if (banError) {
    back(here, {
      error: `The account is marked ${suspend ? "suspended" : "active"}, but the sign-in lock could not be updated: ${banError.message}`,
    });
  }

  revalidatePath("/admin/staff");
  revalidatePath(here);
  back(here, { saved: suspend ? "Account suspended. They are signed out of new sessions." : "Account reactivated." });
}

/* ----------------------------------------------------- reset password */

export async function resetStaffPassword(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const here = `/admin/staff/${userId}`;
  const { user } = await ctx(here);

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(here, { error: firstIssue(parsed.error, "Check the password.") });

  if (parsed.data.userId === user.id) {
    back(here, { error: "Use 'My password' to change your own password." });
  }

  const { error } = await createSupabaseAuthAdminClient().auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  });
  if (error) back(here, { error: `Could not set the password: ${error.message}` });

  back(here, { saved: "Password changed. Give the new password to the staff member; ask them to change it under 'My password'." });
}
