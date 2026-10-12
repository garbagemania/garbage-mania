import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  AREA_ACCESS,
  FINANCE_HOME_PATH,
  financeCanAccessPath,
  roleCanAccess,
  type Area,
} from "@/types/roles";

/**
 * Route guard. Resolves the signed-in user's role from the database via
 * updateSession() (never from a JWT claim) and checks it against
 * AREA_ACCESS. Layouts re-check server-side; Postgres RLS is the final
 * boundary. See docs/ROLES_AND_PERMISSIONS.md.
 */

function areaForPath(pathname: string): Area | null {
  for (const area of Object.keys(AREA_ACCESS) as Area[]) {
    const prefix = `/${area}`;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return area;
  }
  return null;
}

/** Redirect while keeping any session cookies updateSession() refreshed. */
function redirectTo(request: NextRequest, path: string, from: Response, search?: URLSearchParams) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = search ? search.toString() : "";

  const redirect = NextResponse.redirect(url);
  const refreshed = (from as NextResponse).cookies?.getAll?.() ?? [];
  for (const cookie of refreshed) redirect.cookies.set(cookie);
  return redirect;
}

export async function middleware(request: NextRequest) {
  const { response, user, role, status } = await updateSession(request);

  const area = areaForPath(request.nextUrl.pathname);
  if (!area) return response; // public route

  if (!user) {
    return redirectTo(
      request,
      "/login",
      response,
      new URLSearchParams({ redirectTo: request.nextUrl.pathname }),
    );
  }

  // A suspended or disabled account is locked out immediately, even if its
  // access token has not expired yet.
  if (status && status !== "active") {
    return redirectTo(
      request,
      "/login",
      response,
      new URLSearchParams({ error: "This account has been suspended. Please contact an administrator." }),
    );
  }

  if (!role || !roleCanAccess(role, area)) {
    return redirectTo(request, "/not-authorized", response);
  }

  // The accountant (finance role) may only use the finance screens. Anything
  // else under /admin sends them back to the finance dashboard. This also
  // covers Server Actions, which POST to the page URL they belong to.
  if (role === "finance" && area === "admin" && !financeCanAccessPath(request.nextUrl.pathname)) {
    return redirectTo(request, FINANCE_HOME_PATH, response);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/driver/:path*", "/portal/:path*"],
};
