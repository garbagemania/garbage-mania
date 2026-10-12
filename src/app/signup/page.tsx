import { SignupForm } from "@/components/signup/signup-form";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/brand/site-footer";

export const metadata = { title: "Customer sign-up — Garbage Mania" };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen justify-center bg-neutral-50 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-lg border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
        <Logo size="lg" priority />
        <h1 className="mt-4 text-2xl font-bold text-neutral-900">Client on-boarding</h1>
        <p className="mb-6 mt-1 text-sm text-neutral-600">
          Fill in your details to apply for an account. We review every application before it is activated.
        </p>
        <SignupForm />
        <SiteFooter className="mt-6" />
      </div>
    </main>
  );
}
