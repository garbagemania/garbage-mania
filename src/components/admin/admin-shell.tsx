"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import type { AdminNavGroup } from "@/config/admin-nav";

interface AdminShellProps {
  navGroups: AdminNavGroup[];
  userLabel: string;
  roleLabel: string;
  signOutAction: () => void;
  children: React.ReactNode;
}

/**
 * The real /admin shell: a top header (wordmark, current user, sign out,
 * mobile menu toggle) and a role-scoped sidebar (desktop: always visible;
 * mobile: a slide-over drawer), wrapping a content area. `navGroups` is
 * already filtered to the signed-in user's role by navForRole() before
 * this renders — this component only handles layout/interaction, not
 * authorization.
 */
export function AdminShell({ navGroups, userLabel, roleLabel, signOutAction, children }: AdminShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-brand-green-700 bg-brand-green-600 px-4 py-3 text-white print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-brand-green-700 md:hidden"
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <MenuIcon />
          </button>
          <Logo size="sm" plate href="/admin" priority />
          <span className="hidden text-sm text-white/80 sm:inline">{roleLabel === "Finance" ? "Finance" : "Admin"}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-right sm:block">
            <span className="block font-medium">{userLabel}</span>
            <span className="block text-xs text-white/70">{roleLabel}</span>
          </span>
          <Link
            href="/admin/account"
            className="rounded-md px-2 py-1.5 text-sm text-white/90 underline-offset-2 hover:underline"
          >
            My password
          </Link>
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
        {/* Desktop sidebar */}
        <nav
          aria-label="Admin navigation"
          className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white p-4 md:block print:hidden"
        >
          <NavContent navGroups={navGroups} pathname={pathname} />
        </nav>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Close navigation menu"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <nav
              aria-label="Admin navigation"
              className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-white p-4 shadow-lg"
            >
              <NavContent navGroups={navGroups} pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
            </nav>
          </div>
        )}

        <main className="flex-1 bg-neutral-50 p-4 sm:p-6 print:bg-white print:p-0">{children}</main>
      </div>
    </div>
  );
}

function NavContent({
  navGroups,
  pathname,
  onNavigate,
}: {
  navGroups: AdminNavGroup[];
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {navGroups.map((group) => (
        <div key={group.label}>
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {group.label}
          </h2>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm font-medium",
                      active
                        ? "bg-brand-green-50 text-brand-green-700"
                        : "text-neutral-700 hover:bg-neutral-100",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
