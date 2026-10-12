"use client";

import { Button } from "@/components/ui/button";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-neutral-900">We couldn&apos;t load this page</h2>
      <p className="mt-1 text-sm text-neutral-600">
        {error.message || "Something went wrong."} Please try again. If it keeps happening, contact Garbage Mania.
      </p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
