"use client";

import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary for everything under /admin (Next.js
 * convention — this file name is special). Catches rendering/data errors
 * that escape a page's own try/catch and shows a real retry action
 * instead of a blank screen.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <h2 className="text-lg font-semibold text-neutral-900">Something went wrong</h2>
      <p className="max-w-md text-sm text-neutral-600">
        {error.message || "An unexpected error occurred loading this page."}
      </p>
      <Button onClick={() => reset()} variant="outline">
        Try again
      </Button>
    </div>
  );
}
