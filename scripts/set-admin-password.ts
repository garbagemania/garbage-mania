/**
 * scripts/set-admin-password.ts
 *
 * Companion to bootstrap-admin.ts. The app currently has no page that
 * handles Supabase invite links, so an invited admin has no way to choose
 * a password. This script sets one, locally, for an EXISTING STAFF user.
 *
 * The password is typed at a hidden prompt - never passed as an argument or
 * env var, so it stays out of shell history. Like bootstrap-admin.ts it uses
 * the service-role key, which must be exported for this one command only
 * (not kept in .env.local).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/set-admin-password.ts --email you@example.com
 *
 * Safety: refuses to touch any account that does not have a staff profile,
 * so it cannot be used as a general password-reset tool for customers.
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
  if (!email) {
    console.error("Usage: npx tsx scripts/set-admin-password.ts --email <email>");
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

  // Find the auth user by email (page through in case of many users).
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("Could not list users:", error.message);
      process.exit(1);
    }
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) {
    console.error(`No auth user found for ${email}. Run bootstrap:admin first.`);
    process.exit(1);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("kind")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.kind !== "staff") {
    console.error("That account has no staff profile. Refusing to set a password for it.");
    process.exit(1);
  }

  const password = await promptHidden("New password (min 12 characters): ");
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }
  const confirm = await promptHidden("Repeat password: ");
  if (confirm !== password) {
    console.error("Passwords did not match. Nothing was changed.");
    process.exit(1);
  }

  // email_confirm: true marks the invited (unconfirmed) address as confirmed
  // so password sign-in works.
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (updateError) {
    console.error("Failed to set password:", updateError.message);
    process.exit(1);
  }

  console.log(`Done. ${email} can now sign in at /login with the password you just set.`);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
