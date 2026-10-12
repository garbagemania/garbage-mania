import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

export const metadata = { title: "Reset password · Garbage Mania" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Reset your password</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Enter your email and we&apos;ll send you a link to choose a new password.
          </p>
        </div>

        {params.sent ? (
          <p role="status" className="rounded-md bg-brand-green-50 px-3 py-2 text-sm text-brand-green-700">
            If that email belongs to an account, a reset link is on its way. Check your inbox (and spam folder).
          </p>
        ) : (
          <>
            {params.error && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {params.error}
              </p>
            )}
            <form action={requestPasswordReset} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-medium text-neutral-600">
                  Email
                </label>
                <Input id="email" name="email" type="email" autoComplete="username" required />
              </div>
              <SubmitButton pendingLabel="Sending…" className="w-full">
                Send reset link
              </SubmitButton>
            </form>
          </>
        )}

        <p className="text-center text-sm">
          <Link href="/login" className="font-medium text-brand-green-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
