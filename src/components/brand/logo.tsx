import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The Garbage Mania company logo. Single source of truth: every page and
 * shell renders the brand through this component, so swapping the artwork
 * later means replacing public/brand/garbage-mania-logo.png and nothing else.
 *
 * The artwork is 434x101 (aspect ratio ~4.3:1) with a transparent background.
 *
 * - `plate`: draws a white rounded chip behind the logo. Use it on the green
 *   header bars, where the logo's green outline would otherwise sink into
 *   the background.
 * - `href`: wraps the logo in a link (e.g. back to the home screen).
 */
const HEIGHTS = {
  sm: 28, // mobile drawer, dense bars
  md: 36, // app header bars
  lg: 56, // sign-in / sign-up cards
  xl: 72, // landing page
} as const;

const RATIO = 434 / 101;

export type LogoSize = keyof typeof HEIGHTS;

interface LogoProps {
  size?: LogoSize;
  plate?: boolean;
  href?: string;
  priority?: boolean;
  className?: string;
}

export function Logo({ size = "md", plate = false, href, priority = false, className }: LogoProps) {
  const height = HEIGHTS[size];
  const width = Math.round(height * RATIO);

  const image = (
    <Image
      src="/brand/garbage-mania-logo.png"
      alt="Garbage Mania"
      width={width}
      height={height}
      priority={priority}
      className="block h-auto max-w-full"
      style={{ width, height: "auto" }}
    />
  );

  const content = plate ? (
    <span className={cn("inline-flex items-center rounded-md bg-white px-2 py-1 shadow-sm", className)}>{image}</span>
  ) : (
    <span className={cn("inline-flex items-center", className)}>{image}</span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label="Garbage Mania home" className="inline-flex rounded-md">
      {content}
    </Link>
  );
}
