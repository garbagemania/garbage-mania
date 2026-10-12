import { z } from "zod";

/**
 * Every environment variable the app depends on is declared and validated
 * here. Import `env` instead of reading `process.env` directly elsewhere —
 * that way a missing/misconfigured variable fails fast at startup with a
 * clear message, instead of surfacing as a confusing runtime error deep in
 * a request handler.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(), // server-only, never exposed to the client
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Garbage Mania"),

  // M-Pesa Daraja — placeholders for the payments integration phase.
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

function loadEnv() {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
    MPESA_PASSKEY: process.env.MPESA_PASSKEY,
    MPESA_ENV: process.env.MPESA_ENV,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(
      "Invalid environment configuration:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error(
      "Environment validation failed. Copy .env.example to .env.local and fill in the required values.",
    );
  }

  return parsed.data;
}

export const env = loadEnv();
