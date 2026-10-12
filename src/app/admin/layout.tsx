import { redirect } from "next/navigation";
import { requireAuthenticatedUser, AuthenticationError } from "@/lib/auth/session";
import { requireRole, AuthorizationError } from "@/lib/auth/rbac";
import { AREA_ACCESS, type Role } from "@/types/roles";
import { navForRole } from "@/config/admin-nav";
import { AdminShell } from "@/components/admin/admin-shell";
import { signOut } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Administrator",
  finance: "Finance",
  operations_manager: "Operations Manager",
  driver: "Driver",
  customer: "Customer",
};

/**
 * Server-side enforcement for every /admin page, in addition to
 * src/middleware.ts — defense in depth per "all authorization must be
 * enforced server-side for protected operations." Middleware normally
 * catches unauthenticated/wrong-role requests first; this is what runs if
 * a request ever reaches rendering without having gone through it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let role: Role;
  let userLabel: string;

  try {
    const user = await requireAuthenticatedUser();
    requireRole(user, AREA_ACCESS.admin);
    role = user.role as Role;
    userLabel = user.fullName ?? user.email ?? "Signed in";
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/login?redirectTo=/admin");
    if (error instanceof AuthorizationError) redirect("/not-authorized");
    throw error;
  }

  // Two-step login: if this person turned it on, a password-only session is not enough.
  const { data: aal } = await createSupabaseServerClient().auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/mfa?redirectTo=/admin");

  return (
    <AdminShell
      navGroups={navForRole(role)}
      userLabel={userLabel}
      roleLabel={ROLE_LABELS[role]}
      signOutAction={signOut}
    >
      {children}
    </AdminShell>
  );
}
