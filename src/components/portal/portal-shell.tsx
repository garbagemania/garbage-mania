"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import type { PortalNavItem } from "@/config/portal-nav";

interface PortalShellProps {
  navItems: PortalNavItem[];
  userLabel: string;
  signOutAction: () => void;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string) {
  return href === "/portal" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Customer portal shell: green top bar, sidebar on desktop, slide-over menu
 * on mobile. Layout/interaction only - authorization happens in the portal
 * layout, middleware and (finally) RLS.
 */
export function PortalShell({ navItems, userLabel, signOutAction, children }: PortalShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = (
    <nav aria-label="Customer portal" className="flex flex-col gap-1 p-3">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-brand-green-50 text-brand-green-700"
                : "text-neutral-700 hover:bg-neutral-100",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="flex items-center justify-between border-b border-brand-green-700 bg-brand-green-600 px-4 py-3 text-white print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-brand-green-700 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <Logo size="sm" plate href="/portal" priority />
          <span className="hidden text-sm text-white/80 sm:inline">Customer Portal</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden max-w-[16rem] truncate font-medium sm:block">{userLabel}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-white/30 px-3 py-1.5 text-sm hover:bg-brand-green-700"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-neutral-200 bg-white md:block print:hidden">{links}</aside>

        {open && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
              <div className="border-b border-neutral-100 px-4 py-3">
                <Logo size="sm" />
              </div>
              {links}
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6 print:p-0">
          <div className="mx-auto max-w-5xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
