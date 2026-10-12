import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class lists safely (handles conflicting utility classes). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Kenyan Shillings, e.g. formatKES(1500) -> "KES 1,500.00" */
export function formatKES(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Format a date for display in the Africa/Nairobi timezone. */
export function formatDate(date: Date | string, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...opts,
  }).format(d);
}
