# Garbage Mania — Design System Foundation

## Brief

Professional, clean, modern, trustworthy, environmental/waste-management focus.
Green, yellow, and white as the primary visual direction. Responsive,
mobile-first, accessible. The company logo lives in `public/brand/garbage-mania-logo.png` (transparent PNG) and is always
rendered through the `<Logo />` component (`src/components/brand/logo.tsx`) - never an `<img>` tag - so
it can be swapped in one place. On the green header bars it sits on a white plate (`plate` prop) because
its green outline would otherwise sink into the bar. Favicon / app icon: `src/app/icon.png`, `apple-icon.png`.

## Who actually uses this

Three very different contexts, one system:
- **Admin/Finance/Ops/Support staff** at a desk, all day, working dense
  tabular data (invoices, ledgers, routes) — needs speed and legibility, not
  decoration.
- **Drivers** on a phone, outdoors, moving between stops — needs high
  contrast, large touch targets, minimal reading per screen.
- **Customers** (individual + corporate) checking a bill or requesting a
  pickup — needs to feel like a company that shows up and handles their
  money correctly.

This is operational software with one public-facing surface (the customer
portal), not a marketing site. Trust here comes from clarity and precision —
aligned tables, real numbers, unambiguous status — not hero imagery or motion.

## Token system (as implemented in `src/config/theme.ts`)

**Color**
- `neutral` (0–900, white → near-black): surfaces and text. `neutral.50` is
  the base app background (warm off-white, not stark `#FFFFFF`); `neutral.900`
  is body text — a near-black with a slight warmth, not pure `#000`.
- `green` (50–900, brand primary): `green.500` (`#1F7A45`) is the primary
  interactive color — primary buttons, links, active nav, "paid"/"collected"
  status. `green.600`/`700` are used for header/top-bar surfaces where a
  deeper, more institutional tone reads better than the interactive shade.
- `yellow` (50–900, brand secondary): used deliberately sparingly —
  secondary actions, warning/due-soon states, and highlight accents. Never
  used as a large background fill; it stays a signal color (bins, hazard
  signage) rather than decoration.
- `status.success / warning / danger / info`: kept as distinct flat colors
  (not aliases of `green`/`yellow`) so a status badge's meaning never depends
  on remembering "yellow currently also means brand." Danger (`#C0362C`) and
  info (`#2563A8`) exist outside the brand palette entirely, reserved for
  error/destructive and informational states.

**Type**
- One functional family — **Inter** — across the whole product. This is
  deliberate: with three surfaces (dense admin tables, a sunlight-readable
  driver screen, a customer portal) that all need to share one legible
  interface font, a second display face would add personality at the cost of
  the consistency this system needs more. Numerals (invoice totals, dashboard
  stats) get `IBM Plex Mono` as a reserved tabular-figure treatment, not a
  second general-purpose typeface.
- Scale: `xs` 0.75rem → `4xl` 2.25rem, defined once in `theme.ts` and consumed
  by Tailwind's `fontSize` config — never a hard-coded size in a component.

**Layout**
- Left-aligned throughout — this is operational software, not a
  hero-centered marketing page.
- `AppShell` (`src/components/layout/app-shell.tsx`) is the one shared
  chrome: a `green.600` top bar carrying the wordmark + area label, an
  optional nav slot, and a content region. Each route area (`/admin`,
  `/portal`, `/driver`) wraps its pages in it and supplies its own nav —
  shared chrome, area-specific navigation.
- Tabular data (invoices, ledgers, route lists) belongs in real `<table>`s
  with hairline row dividers once those views exist — not a grid of shadowed
  cards. `Card` is reserved for genuinely discrete objects (one invoice
  summary, one vehicle), not used as a default wrapper for every list.

## What we're avoiding

No cream+terracotta palette, no near-black+single-neon-accent theme, no
uniform rounded-card-plus-soft-shadow treatment applied to everything
regardless of content, no tracked-out ALL-CAPS eyebrow labels, no arrows
appended to buttons, no invented numbered-step markers outside genuinely
sequential content (a driver's route stops legitimately are — that's the one
place numbering belongs).

## Where this lives in code

- `src/config/theme.ts` — token values as a typed object; the single source
  of truth.
- `tailwind.config.ts` — maps those tokens into Tailwind's theme, so
  components use `bg-brand-green-500`, `text-neutral-600`, `bg-danger`, etc.
  instead of a hard-coded hex value anywhere.
- `src/app/globals.css` — a small set of raw CSS custom properties (for the
  handful of places outside Tailwind's reach, e.g. inline SVG) mirroring the
  same values, plus the accessibility floor: visible focus rings and
  `prefers-reduced-motion` support.
- `src/components/ui/` — `Button`, `Card`, `Badge`, `Input` built once
  against these tokens; new UI should extend these rather than reach for
  raw Tailwind color utilities directly.

Accessibility floor (already in `globals.css`, not to be removed later):
visible `:focus-visible` outlines everywhere, and `prefers-reduced-motion`
honored globally.
