import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found · Garbage Mania" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-4 text-center">
      <Logo size="lg" priority />
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">We couldn&apos;t find that page</h1>
      <p className="max-w-sm text-sm text-neutral-600">
        The link may be old or mistyped. Head back and try again.
      </p>
      <Link href="/">
        <Button>Go to home</Button>
      </Link>
    </main>
  );
}
