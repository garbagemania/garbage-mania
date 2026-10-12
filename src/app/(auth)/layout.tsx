import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/brand/site-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" priority />
        </div>
        {children}
      </div>
      <SiteFooter className="mt-8" />
    </div>
  );
}
