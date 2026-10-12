import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing point for links Supabase emails out (password reset). Exchanges the
 * one-time `code` for a session, then forwards to `next`. `next` must be a
 * same-site path - never an absolute URL - so this can't be used as an open redirect.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const failed = new URL("/login", request.url);
  failed.searchParams.set("error", "That link is invalid or has expired. Please request a new one.");
  return NextResponse.redirect(failed);
}
