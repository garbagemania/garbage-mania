import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function SignupSubmittedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <Logo size="lg" priority />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-neutral-900">Application received</h1>
        <p className="mt-3 text-sm text-neutral-600">
          Thank you. Garbage Mania will review your details. You&apos;ll be able to sign in once your account has been
          approved. If your project requires email confirmation, please also confirm your email address using the link we
          sent you.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-brand-green-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-green-600"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
