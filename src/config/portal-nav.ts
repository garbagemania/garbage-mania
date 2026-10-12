/**
 * Customer portal navigation. Every href MUST have a real page.tsx under
 * src/app (enforced by tests/portal-nav.test.ts). Do not add disabled or
 * unfinished entries.
 */
export interface PortalNavItem {
  label: string;
  href: string;
}

export const PORTAL_NAV: PortalNavItem[] = [
  { label: "Dashboard", href: "/portal" },
  { label: "My account", href: "/portal/account" },
  { label: "Addresses", href: "/portal/addresses" },
  { label: "Service plan", href: "/portal/subscription" },
  { label: "Collections", href: "/portal/collections" },
  { label: "Requests", href: "/portal/requests" },
  { label: "Billing", href: "/portal/billing" },
  { label: "Statement", href: "/portal/statement" },
];
