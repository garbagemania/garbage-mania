import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function Notice({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-md px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-brand-green-50 text-brand-green-700"}`}
    >
      {error ?? success}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-neutral-500">{children}</CardContent>
    </Card>
  );
}

export function LoadError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
      Could not load this information: {message}
    </p>
  );
}

/** Shown to a signed-in user (e.g. super_admin) who has no linked customer record. */
export function NoCustomerAccount() {
  return (
    <EmptyState>
      This login is not linked to a customer account, so there is no customer information to show.
    </EmptyState>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
}) {
  const body = (
    <Card className="h-full p-5">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-neutral-900 sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-sm text-neutral-500">{hint}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green-500">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

export const COLLECTION_TONE: Record<string, Tone> = {
  scheduled: "info",
  assigned: "info",
  in_progress: "warning",
  completed: "success",
  failed: "danger",
  rescheduled: "neutral",
  cancelled: "neutral",
};

export const INVOICE_TONE: Record<string, Tone> = {
  issued: "info",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
  void: "neutral",
};

export const PAYMENT_TONE: Record<string, Tone> = {
  pending: "warning",
  confirmed: "success",
  failed: "danger",
  reversed: "neutral",
};

export const REQUEST_TONE: Record<string, Tone> = {
  submitted: "info",
  approved: "success",
  scheduled: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export const SUBSCRIPTION_TONE: Record<string, Tone> = {
  pending: "warning",
  active: "success",
  paused: "neutral",
  cancelled: "neutral",
};

export function Status({ value, tones }: { value: string; tones: Record<string, Tone> }) {
  return <Badge tone={tones[value] ?? "neutral"}>{value.replace(/_/g, " ")}</Badge>;
}

export function label(value: string | null | undefined): string {
  if (!value) return "—";
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
