import { redirect } from "next/navigation";
import { requireAuthenticatedUser, AuthenticationError } from "@/lib/auth/session";
import { requireRole, AuthorizationError } from "@/lib/auth/rbac";
import { AREA_ACCESS } from "@/types/roles";
import { PORTAL_NAV } from "@/config/portal-nav";
import { PortalShell } from "@/components/portal/portal-shell";
import { signOut } from "@/lib/auth/actions";
import { getCustomerApproval } from "@/lib/portal/customer";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let userLabel: string;
  let isCustomer = false;

  try {
    const user = await requireAuthenticatedUser();
    requireRole(user, AREA_ACCESS.portal);
    userLabel = user.fullName ?? user.email ?? "Signed in";
    isCustomer = user.role === "customer";
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/login?redirectTo=/portal");
    if (error instanceof AuthorizationError) redirect("/not-authorized");
    throw error;
  }

  // A customer who has not been approved never sees portal pages, even with a
  // valid session. (RLS independently returns no data for them.)
  if (isCustomer && (await getCustomerApproval()) !== "approved") {
    redirect("/awaiting-approval");
  }

  return (
    <PortalShell navItems={PORTAL_NAV} userLabel={userLabel} signOutAction={signOut}>
      {children}
    </PortalShell>
  );
}
