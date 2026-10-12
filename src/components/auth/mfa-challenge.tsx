"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Second sign-in step: asks for the 6-digit code from the authenticator app. */
export function MfaChallenge({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find((f) => f.status === "verified");
    if (!factor) {
      setBusy(false);
      setError("Your session expired. Please sign in again.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (verifyError) {
      setBusy(false);
      setError("That code didn't match. Try the newest code from your app.");
      return;
    }
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <div>
        <label htmlFor="code" className="mb-1 block text-xs font-medium text-neutral-600">6-digit code</label>
        <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </div>
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</Button>
    </form>
  );
}
