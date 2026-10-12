import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import type { Role } from "@/types/roles";

export const FINANCE_READERS: Role[] = ["super_admin", "admin", "finance"];
export const FINANCE_WRITERS: Role[] = ["super_admin", "finance"];

/** Untyped client: src/types/database.ts predates migration 021 (run `npm run db:types`). */
export const untyped = (c: unknown) => c as SupabaseClient;

export const PAYMENT_TONES = { pending: "warning", confirmed: "success", failed: "danger", reversed: "neutral" } as const;
export const PAYMENT_LABELS: Record<string, string> = {
  pending: "Pending verification",
  confirmed: "Verified",
  failed: "Rejected",
  reversed: "Reversed",
};
export const INVOICE_TONES = {
  draft: "neutral", issued: "info", partially_paid: "warning", paid: "success", overdue: "danger", void: "neutral",
} as const;

export function Notice({ saved, error }: { saved?: string; error?: string }) {
  return (
    <>
      {saved && <p role="status" className="rounded-md bg-brand-green-50 px-3 py-2 text-sm text-brand-green-700">{saved}</p>}
      {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
    </>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
        <p className="text-xl font-semibold text-neutral-900">{value}</p>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export const fieldClass = "h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm";
export const labelClass = "mb-1 block text-xs font-medium text-neutral-600";

/** Today in Nairobi as YYYY-MM-DD. */
export const todayNairobi = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const RANGES = ["today", "week", "month", "prev_month", "year", "custom"] as const;
export type RangeKey = (typeof RANGES)[number];

export function resolveRange(key: string | undefined, from?: string, to?: string) {
  const today = todayNairobi();
  const [y = 0, m = 1] = today.split("-").map(Number);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const k: RangeKey = (RANGES as readonly string[]).includes(key ?? "") ? (key as RangeKey) : "month";
  let start = today;
  let end = today;
  if (k === "week") {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    start = addDays(today, -dow);
  } else if (k === "month") {
    start = `${y}-${String(m).padStart(2, "0")}-01`;
  } else if (k === "prev_month") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    start = `${py}-${String(pm).padStart(2, "0")}-01`;
    end = addDays(`${y}-${String(m).padStart(2, "0")}-01`, -1);
  } else if (k === "year") {
    start = `${y}-01-01`;
  } else if (k === "custom") {
    start = from && iso.test(from) ? from : today;
    end = to && iso.test(to) ? to : today;
    if (end < start) end = start;
  }
  return { key: k, from: start, to: end };
}
