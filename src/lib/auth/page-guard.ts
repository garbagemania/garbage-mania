import { redirect } from "next/navigation";
import { requireAuthenticatedUser, AuthenticationError } from "@/lib/auth/session";
import { requireStaffRole, AuthorizationError } from "@/lib/auth/rbac";
import type { Role } from "@/types/roles";

/**
 * Page-level role check. Each admin page passes the roles whose RLS
 * policies actually allow them to read that page's tables, so a role that
 * RLS would silently return zero rows for is sent to /not-authorized
 * instead of seeing a misleading empty list. RLS stays the real boundary.
 */
export async function requirePageRoles(allowed: Role[]) {
  try {
    const user = await requireAuthenticatedUser();
    requireStaffRole(user, allowed);
    return user;
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/login");
    if (error instanceof AuthorizationError) redirect("/not-authorized");
    throw error;
  }
}
