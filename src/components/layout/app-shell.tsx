import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

interface AppShellProps {
  title: string;
  navSlot?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Minimal, brand-consistent shell: a green top bar carrying the wordmark and
 * area label, an optional nav slot, and a content area. Each route group
 * (admin, portal, driver) wraps its pages with this and passes its own
 * navigation.
 */
export function AppShell({ title, navSlot, children, className }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-brand-green-700 bg-brand-green-600 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <Logo size="sm" plate priority />
          <span className="text-sm text-brand-green-50/80">{title}</span>
        </div>
        {navSlot}
      </header>
      <main className={cn("flex-1 bg-neutral-50 p-4", className)}>{children}</main>
    </div>
  );
}
