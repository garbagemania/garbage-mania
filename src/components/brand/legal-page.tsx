import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/brand/site-footer";

/** Shared shell for the public Terms / Privacy / Contact pages. */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" href="/" priority />
        </div>
        <article className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 text-sm leading-relaxed text-neutral-700 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
          {updated && <p className="text-xs text-neutral-500">Last updated: {updated}</p>}
          {children}
        </article>
        <SiteFooter className="mt-8" />
      </div>
    </div>
  );
}
