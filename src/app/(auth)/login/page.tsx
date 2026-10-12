import Link from "next/link";
import { login } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import { PasswordInput } from "@/components/auth/password-input";

export const metadata = { title: "Sign in · Garbage Mania" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; redirectTo?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Sign in</h1>
          <p className="mt-1 text-sm text-neutral-600">Welcome back. Sign in to your Garbage Mania account.</p>
        </div>

        {params.message && (
          <p role="status" className="rounded-md bg-brand-green-50 px-3 py-2 text-sm text-brand-green-700">
            {params.message}
          </p>
        )}
        {params.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {params.error}
          </p>
        )}

        <form action={login} className="space-y-4">
          {/* The route guard sends people here with ?redirectTo=…; carry it through to the action. */}
          <input type="hidden" name="redirectTo" value={params.redirectTo ?? ""} />
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-neutral-600">
              Email
            </label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="block text-xs font-medium text-neutral-600">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs font-medium text-brand-green-700 hover:underline">
                Forgot password?
              </Link>
            </div>
            <PasswordInput />
          </div>
          <SubmitButton pendingLabel="Signing in…" className="w-full">
            Sign in
          </SubmitButton>
        </form>

        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200" />
          NEW CUSTOMER?
          <span className="h-px flex-1 bg-neutral-200" />
        </div>

        <Link
          href="/signup"
          className="flex h-10 w-full items-center justify-center rounded-md border border-brand-green-500 text-sm font-medium text-brand-green-700 hover:bg-brand-green-50"
        >
          Create customer account
        </Link>
      </CardContent>
    </Card>
  );
}
