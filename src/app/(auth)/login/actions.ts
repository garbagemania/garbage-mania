"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  ROLE_HOME_AREA,
  AREA_ACCESS,
  FINANCE_HOME_PATH,
  financeCanAccessPath,
  type Area,
} from "@/types/roles";

const AREA_PATH: Record<Area, string> = {
  admin: "/admin",
  driver: "/driver",
  portal: "/portal",
};

/**
 * Server Action backing the login form. Runs entirely server-side: signs
 * in with Supabase Auth (email + password), then resolves the user's role
 * from the database (never from a client-supplied value) to decide where
 * to send them. A signed-in user with no `profiles` row yet, or whose role
 * has no home area, lands on /not-authorized rather than guessing.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rawRedirect = String(formData.get("redirectTo") ?? "");
  // Same-site paths only: "//evil.com" and "/\\evil.com" are treated as external by browsers.
  const redirectTo = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes("\\") ? rawRedirect : "";

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Email and password are required.")}`);
  }

  const supabase = createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    redirect(`/login?error=${encodeURIComponent("Incorrect email or password.")}`);
  }

  const user = await getCurrentUser();

  if (!user || !user.role) {
    redirect("/not-authorized");
  }

  // Suspended or disabled accounts cannot sign in.
  if (user.status && user.status !== "active") {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent("This account has been suspended. Please contact an administrator.")}`);
  }

  // Customers must be approved by a super admin before they can sign in.
  // (The database also withholds all customer data until then - this is the
  // friendly front door, not the lock.) Staff have no customer link, so skip.
  if (user.role === "customer") {
    const { data: approval } = await supabase.rpc("customer_approval_status");
    if (approval !== "approved") {
      await supabase.auth.signOut();
      const message =
        approval === "rejected"
          ? "Your application was not approved. Please contact Garbage Mania."
          : approval === "pending"
            ? "Your account is awaiting approval. You can sign in once Garbage Mania has approved it."
            : "Your customer account is not set up yet. Please contact Garbage Mania.";
      redirect(`/login?error=${encodeURIComponent(message)}`);
    }
  }

  // The accountant only ever lands in (and returns to) the finance screens.
  if (user.role === "finance") {
    redirect(redirectTo.startsWith("/") && financeCanAccessPath(redirectTo) ? redirectTo : FINANCE_HOME_PATH);
  }

  const homeArea = ROLE_HOME_AREA[user.role];
  const homePath = AREA_PATH[homeArea];

  // Honor a middleware-supplied redirectTo, but only if the signed-in
  // role is actually allowed into that area — otherwise fall back to the
  // role's own home area rather than bouncing them through /not-authorized
  // for a link they may have simply had bookmarked from a previous role.
  if (redirectTo.startsWith("/")) {
    const targetArea = (Object.keys(AREA_ACCESS) as Area[]).find((area) =>
      redirectTo.startsWith(AREA_PATH[area]),
    );
    if (targetArea && AREA_ACCESS[targetArea].includes(user.role)) {
      redirect(redirectTo);
    }
  }

  redirect(homePath);
}
