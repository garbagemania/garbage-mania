"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Factor = { id: string; status: string; friendly_name?: string | null };
type Enrolment = { factorId: string; qr: string; secret: string };

/** Turn two-step login (authenticator app) on or off for the signed-in staff member. */
export function TwoStepSetup() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrol, setEnrol] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function refresh() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  }
  useEffect(() => {
    void refresh();
  }, []);

  const verified = factors.find((f) => f.status === "verified");

  async function start() {
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    // Clear any half-finished attempts first so enrolling can be retried.
    for (const f of factors.filter((x) => x.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Garbage Mania ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) {
      setMessage({ kind: "error", text: "Could not start setup. Please try again." });
      return;
    }
    setEnrol({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirm() {
    if (!enrol) return;
    setBusy(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrol.factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setMessage({ kind: "error", text: "That code didn't match. Check your phone's clock and try the newest code." });
      return;
    }
    setEnrol(null);
    setCode("");
    setMessage({ kind: "ok", text: "Two-step login is on. You'll be asked for a code each time you sign in." });
    await refresh();
  }

  async function turnOff() {
    if (!verified || !window.confirm("Turn off two-step login? Your account will be protected by your password only.")) return;
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
    setBusy(false);
    setMessage(error ? { kind: "error", text: "Could not turn it off. Sign in again with your code and retry." } : { kind: "ok", text: "Two-step login is off." });
    await refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Two-step login</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) to your sign-in,
            so a stolen password alone is not enough. Recommended for admin and finance accounts.
          </p>
        </div>

        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-sm ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-brand-green-50 text-brand-green-700"}`}>
            {message.text}
          </p>
        )}

        {verified && !enrol && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-brand-green-700">Status: ON</p>
            <Button type="button" variant="outline" onClick={turnOff} disabled={busy}>Turn off</Button>
          </div>
        )}

        {!verified && !enrol && (
          <Button type="button" onClick={start} disabled={busy}>{busy ? "Please wait…" : "Set up two-step login"}</Button>
        )}

        {enrol && (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
              <li>Open your authenticator app and scan this code.</li>
              <li>Type the 6-digit number the app shows, then press Confirm.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrol.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-md border border-neutral-200 bg-white p-2" />
            <p className="text-xs text-neutral-500">Can&apos;t scan? Enter this key manually: <code className="break-all font-mono text-neutral-800">{enrol.secret}</code></p>
            <div className="flex gap-2">
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="max-w-[10rem]" />
              <Button type="button" onClick={confirm} disabled={busy || code.length !== 6}>Confirm</Button>
              <Button type="button" variant="ghost" onClick={() => { setEnrol(null); setCode(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
