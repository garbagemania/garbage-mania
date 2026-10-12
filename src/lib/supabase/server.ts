import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Reads/writes the session via Next.js cookies() so auth state stays in sync
 * across server and client.
 */
export function createSupabaseServerClient(): SupabaseClient<Database> {
  const cookieStore = cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component with no writable cookie jar
            // (e.g. during static rendering) — session refresh happens in
            // middleware instead, so this is safe to ignore.
          }
        },
      },
    },
  ) as unknown as SupabaseClient<Database>;
}

/**
 * Service-role client for privileged, server-only operations that must
 * bypass RLS (e.g. scheduled billing jobs, admin-triggered bulk actions).
 * NEVER import this in a Client Component or expose it to the browser.
 * Throws if the service role key is not configured, so misuse fails loudly.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient<Database> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Service-role operations are unavailable in this environment.",
    );
  }

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    },
  ) as unknown as SupabaseClient<Database>;
}

/**
 * Service-role client used ONLY for the Auth admin API (create a login,
 * ban/unban, set a password, list emails). Business data is never written
 * through it: those writes use the signed-in user's own session so RLS and
 * the audit log see the real actor. Server-only; throws if not configured.
 */
export function createSupabaseAuthAdminClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Staff management needs it in the server environment.",
    );
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
