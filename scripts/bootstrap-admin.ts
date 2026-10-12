/**
 * scripts/bootstrap-admin.ts
 *
 * One-time, LOCALLY-RUN script to create the FIRST super_admin account.
 * This is NOT part of the Next.js application — it is a standalone script
 * that never ships to the browser, so it is safe for it to use the
 * Supabase service-role key (which bypasses RLS by design). Run it once,
 * by the project owner, from a trusted machine or CI secret context that
 * has SUPABASE_SERVICE_ROLE_KEY available.
 *
 * Why this exists: supabase/config.toml disables self-service signup
 * (enable_signup = false), and every RLS policy that lets someone insert
 * a `profiles`/`staff_profiles` row requires the caller to ALREADY be a
 * super_admin/admin (see profiles_insert_staff in
 * supabase/migrations/011_rls_policies.sql). That's correct for every
 * account after the first — but it means the very first admin cannot be
 * created through the normal app at all. This script is the deliberate,
 * narrow exception: it runs with the service-role key (server-only,
 * never exposed to a browser) to create exactly one bootstrap account,
 * and refuses to run again once a super_admin already exists.
 *
 * No password is ever typed into this script, an argument, an environment
 * variable, or shell history: it uses Supabase Auth's invite flow, which
 * emails the new admin a secure, time-limited link to set their own
 * password.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run bootstrap:admin -- --email you@garbagemania.co.ke --name "Your Name"
 *
 * Optional:
 *   --employee-number GM-0001   (defaults to GM-0001)
 *
 * See docs/ADMIN_BOOTSTRAP.md for the full setup procedure.
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const email = arg("email");
  const fullName = arg("name");
  const employeeNumber = arg("employee-number") ?? "GM-0001";

  if (!email || !fullName) {
    console.error(
      'Usage: npm run bootstrap:admin -- --email <email> --name "<full name>" [--employee-number <id>]',
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in the " +
        "environment running this script (not .env.local — export them in your shell " +
        "for this one command so the key is never written to a file in this repo).",
    );
    process.exit(1);
  }

  // Deliberately createClient() from @supabase/supabase-js directly, not
  // the Next.js-flavored @supabase/ssr helpers in src/lib/supabase/ — this
  // script has no request/cookie context to bind to.
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Refuse to run if a super_admin already exists, so this can't be used
  // (accidentally or otherwise) to mint a second break-glass account.
  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id, roles!inner(code)")
    .eq("roles.code", "super_admin")
    .limit(1);

  if (existingError) {
    console.error("Could not check for an existing super_admin:", existingError.message);
    console.error("Has supabase/migrations/001_identity.sql been applied to this project?");
    process.exit(1);
  }
  if (existing && existing.length > 0) {
    console.error(
      "A super_admin already exists. This script only bootstraps the FIRST admin — " +
        "use the admin console to invite additional staff instead.",
    );
    process.exit(1);
  }

  const { data: roleRow, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("code", "super_admin")
    .single();

  if (roleError || !roleRow) {
    console.error("Could not find the super_admin role row:", roleError?.message);
    process.exit(1);
  }

  // { data: { provisioning: "staff" } } is read by
  // handle_new_customer_signup() (supabase/migrations/014_auth_customer_trigger.sql,
  // guarded in 015_staff_provisioning_guard.sql) to skip auto-creating a
  // customer profile for this account - without it, that trigger would
  // race with the profiles insert below and fail with a duplicate-key
  // error, since both write to profiles.id for the same new auth user.
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { provisioning: "staff" },
  });

  if (inviteError || !invited?.user) {
    console.error("Failed to invite user:", inviteError?.message);
    process.exit(1);
  }

  const userId = invited.user.id;

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    role_id: roleRow.id,
    kind: "staff",
    full_name: fullName,
  });

  if (profileError) {
    console.error("Invite email was sent, but creating the profiles row failed:", profileError.message);
    console.error(
      `Manual fix needed: insert a profiles row for auth user ${userId} with ` +
        `role_id ${roleRow.id} and kind 'staff', then a matching staff_profiles row.`,
    );
    process.exit(1);
  }

  const { error: staffError } = await supabase.from("staff_profiles").insert({
    id: userId,
    employee_number: employeeNumber,
  });

  if (staffError) {
    console.error("profiles row created, but staff_profiles insert failed:", staffError.message);
    console.error(`Manual fix needed: insert a staff_profiles row for id ${userId}.`);
    process.exit(1);
  }

  console.log(`Done. Invited ${email} as the first super_admin.`);
  console.log("They'll receive a Supabase Auth email to set their password and sign in at /login.");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
