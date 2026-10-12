import type { ReactNode } from "react";

export const labelClass = "mb-1 block text-xs font-medium text-neutral-600";
export const selectClass = "h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm";

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

export function FormMessage({ error, saved }: { error?: string; saved?: string }) {
  return (
    <>
      {saved && <p role="status" className="rounded-md bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">{saved}</p>}
      {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    </>
  );
}
