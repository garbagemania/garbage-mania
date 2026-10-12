"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/** Catch-all for routes without their own error boundary (driver app, sign-up, etc.). */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-4 text-center">
      <Logo size="lg" />
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Something went wrong</h1>
      <p className="max-w-sm text-sm text-neutral-600">
        Please try again. If it keeps happening, contact Garbage Mania.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
