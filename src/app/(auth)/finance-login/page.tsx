import { financeLogin } from "./actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { PasswordInput } from "@/components/auth/password-input";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Finance sign in · Garbage Mania" };

export default async function FinanceLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-neutral-900">Finance sign in</h1>
          <p className="mt-1 text-sm text-neutral-600">For the Garbage Mania accounts team.</p>
        </div>

        {params.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {params.error}
          </p>
        )}

        <form action={financeLogin} className="space-y-4">
          <input type="hidden" name="redirectTo" value={params.redirectTo ?? ""} />
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-neutral-600">
              Email
            </label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-neutral-600">
              Password
            </label>
            <PasswordInput />
          </div>
          <SubmitButton pendingLabel="Signing in…" className="w-full">
            Sign in
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
