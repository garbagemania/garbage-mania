/**
 * scripts/create-finance-user.ts
 *
 * Creates the accountant's login: a staff account with the `finance` role,
 * which can sign in at /finance-login (or /login) and reach ONLY the
 * finance screens (see FINANCE_ALLOWED_PREFIXES in src/types/roles.ts).
 *
 * Like bootstrap-admin.ts this is a standalone, locally-run script that
 * uses the Supabase service-role key (never shipped to the browser). The
 * password is typed at a hidden prompt - never an argument, env var, or
 * shell history entry.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run create:finance-user -- --email accountant@garbagemania.co.ke \
 *       --name "Full Name" [--employee-number GM-0002]
 *
 * To change the password of an existing finance user later, use
 * scripts/set-admin-password.ts (it works for any staff account).
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      console.error("This script needs an interactive terminal for the hidden password prompt.");
      process.exit(1);
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u0003") process.exit(1); // Ctrl+C
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const fullName = arg("name")?.trim();
  const employeeNumber = arg("employee-number") ?? "GM-FIN-001";

  if (!email || !fullName) {
    console.error(
      'Usage: npm run create:finance-user -- --email <email> --name "<full name>" [--employee-number <id>]',
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be exported in your shell for this command.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: roleRow, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("code", "finance")
    .single();
  if (roleError || !roleRow) {
    console.error("Could not find the finance role row:", roleError?.message);
    console.error("Has supabase/migrations/001_identity.sql been applied to this project?");
    process.exit(1);
  }

  const password = await promptHidden("Password for the accountant (min 12 characters): ");
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }
  const confirm = await promptHidden("Repeat password: ");
  if (confirm !== password) {
    console.error("Passwords did not match. Nothing was created.");
    process.exit(1);
  }

  // provisioning: "staff" makes handle_new_customer_signup() (migration 015)
  // skip creating a customer profile for this account.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { provisioning: "staff", full_name: fullName },
  });
  if (createError || !created?.user) {
    console.error("Failed to create the login:", createError?.message);
    process.exit(1);
  }
  const userId = created.user.id;

  // If either profile insert fails, remove the auth user again so a retry
  // starts clean instead of leaving a login with no role.
  const rollback = async () => {
    await supabase.auth.admin.deleteUser(userId);
  };

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    role_id: roleRow.id,
    kind: "staff",
    full_name: fullName,
  });
  if (profileError) {
    await rollback();
    console.error("Creating the profiles row failed (login removed, nothing was kept):", profileError.message);
    process.exit(1);
  }

  const { error: staffError } = await supabase.from("staff_profiles").insert({
    id: userId,
    employee_number: employeeNumber,
    department: "Finance",
  });
  if (staffError) {
    await rollback();
    console.error("Creating the staff_profiles row failed (login removed, nothing was kept):", staffError.message);
    console.error("If this is a duplicate employee number, re-run with --employee-number <another id>.");
    process.exit(1);
  }

  console.log(`Done. ${email} can now sign in at /finance-login and will only see the finance screens.`);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
