/**
 * Garbage Mania design tokens — the single source of truth for brand color,
 * type, and spacing. Tailwind (tailwind.config.ts) reads these values, and
 * anything that needs a raw token in TypeScript (charts, PDFs, emails) should
 * import from here rather than hard-coding a hex value.
 *
 * Brand direction: professional, clean, modern, trustworthy,
 * environmental/waste-management focus. Green, yellow, and white as the
 * primary visual direction. Logo: public/brand/garbage-mania-logo.png, rendered via <Logo /> (src/components/brand/logo.tsx).
 */

export const colors = {
  // Primary — deep, confident green. Waste collection / environment / "go".
  green: {
    50: "#EAF6EE",
    100: "#CBEAD5",
    200: "#9AD6AE",
    300: "#63BD85",
    400: "#379E62",
    500: "#1F7A45", // primary brand green
    600: "#186438",
    700: "#134F2D",
    800: "#0F3F24",
    900: "#0B301C",
  },
  // Secondary — utility yellow. Used sparingly: alerts, highlights, action accents.
  yellow: {
    50: "#FFF9E6",
    100: "#FFF0BF",
    200: "#FFE185",
    300: "#FFCE47",
    400: "#F5B815",
    500: "#E0A400", // primary brand yellow
    600: "#B98600",
    700: "#8F6800",
    800: "#6B4E00",
    900: "#4A3600",
  },
  // Neutral — white through near-black, used for surfaces and text.
  neutral: {
    0: "#FFFFFF",
    50: "#F7F8F6",
    100: "#EEF0EC",
    200: "#DDE1D9",
    300: "#C2C8BC",
    400: "#9AA394",
    500: "#717A6B",
    600: "#545C4F",
    700: "#3D433A",
    800: "#282C26",
    900: "#171913",
  },
  // Status colors — kept distinct from brand green/yellow so "paid" vs
  // "brand accent" is never visually ambiguous.
  status: {
    success: "#1F7A45",
    warning: "#E0A400",
    danger: "#C0362C",
    info: "#2563A8",
  },
} as const;

export const typography = {
  // One functional family across the whole product (dashboard + portal +
  // field app) — this is an operational tool first, not a marketing site.
  fontFamily: {
    sans: [
      "Inter",
      "-apple-system",
      "BlinkMacSystemFont",
      "Segoe UI",
      "Roboto",
      "Helvetica Neue",
      "Arial",
      "sans-serif",
    ],
    // Reserved for large numerals — invoice totals, dashboard stats.
    mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
  },
  scale: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
  },
} as const;

export const radii = {
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  full: "9999px",
} as const;

export const spacing = {
  // Base 4px scale; Tailwind's default scale already matches this, kept
  // here as documentation of intent rather than a redefinition.
  unit: 4,
} as const;

export type BrandColors = typeof colors;
