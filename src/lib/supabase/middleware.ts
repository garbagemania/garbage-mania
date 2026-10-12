import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Role } from "@/types/roles";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = (createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  )) as unknown as SupabaseClient<Database>;


  const {
    data: {
      user,
    },
  } = await supabase.auth.getUser();


  let role: Role | null = null;
  let status: string | null = null;


  if (user) {

    const {
      data: profile,
    } = await supabase
      .from("profiles")
      .select("role_id, status")
      .eq("id", user.id)
      .maybeSingle();


    status = profile?.status ?? null;

    if (profile?.role_id) {

      const {
        data: roleRecord,
      } = await supabase
        .from("roles")
        .select("code")
        .eq("id", profile.role_id)
        .maybeSingle();


      if (roleRecord?.code) {
        role = roleRecord.code as Role;
      }

    }

  }


  return {
    response,
    user,
    role,
    status,
  };
}
