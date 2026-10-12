import { redirect } from "next/navigation";
import { requireAuthenticatedUser, AuthenticationError } from "@/lib/auth/session";
import { requireRole, AuthorizationError } from "@/lib/auth/rbac";
import { AREA_ACCESS } from "@/types/roles";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  try {
    const user = await requireAuthenticatedUser();
    requireRole(user, AREA_ACCESS.driver);
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/login?redirectTo=/driver");
    if (error instanceof AuthorizationError) redirect("/not-authorized");
    throw error;
  }

  return <div className="mx-auto max-w-md">{children}</div>;
}
