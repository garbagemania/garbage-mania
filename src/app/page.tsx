import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/brand/site-footer";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-neutral-50 px-4 text-center">
      <div>
        <h1 className="flex justify-center">
          <Logo size="xl" priority />
        </h1>
        <p className="mx-auto mt-4 max-w-md text-neutral-600">
          Reliable waste collection for homes and businesses. Sign in to manage your account.
        </p>
      </div>
      <Link href="/login">
        <Button size="lg">Sign in</Button>
      </Link>
      <SiteFooter className="mt-6" />
    </main>
  );
}
