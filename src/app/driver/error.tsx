"use client";

import { Button } from "@/components/ui/button";

export default function DriverError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-neutral-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">Couldn&apos;t load your collections</h1>
      <p className="text-sm text-neutral-600">Check your signal and try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
