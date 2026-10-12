"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { COMPANY, contactLines } from "@/config/company";

/**
 * Letterhead shown ONLY when a page is printed or saved as PDF
 * (statements, invoices). On screen it is hidden - the app header already
 * carries the logo.
 */
export function PrintLetterhead() {
  return (
    <div className="mb-4 hidden items-center justify-between border-b border-neutral-300 pb-3 print:flex">
      <Logo size="lg" />
      <div className="text-right text-xs text-neutral-600">
        <p className="font-semibold text-neutral-900">{COMPANY.legalName}</p>
        {contactLines().map((l) => (
          <p key={l.label}>{l.value}</p>
        ))}
      </div>
    </div>
  );
}

/** Opens the browser print dialog (which also offers "Save as PDF"). Hidden when printing. */
export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
