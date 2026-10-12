import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function NotAuthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-4 text-center">
      <Logo size="lg" priority />
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        You don&apos;t have access to that area
      </h1>
      <p className="max-w-sm text-sm text-neutral-600">
        Your account role doesn&apos;t include this section. If you think this
        is wrong, contact your administrator.
      </p>
      <Link href="/login">
        <Button variant="outline">Back to sign in</Button>
      </Link>
    </main>
  );
}
