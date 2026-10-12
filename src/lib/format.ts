import { formatDate } from "@/lib/utils";

/** Money columns are stored as integer minor units (cents). */
export function formatCents(cents: number | null | undefined, currency = "KES"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDay(value: string | null | undefined): string {
  return value ? formatDate(value) : "—";
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return formatDate(value, { hour: "2-digit", minute: "2-digit" });
}

export function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
