import Link from "next/link";
import { COMPANY } from "@/config/company";

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-center text-xs text-neutral-500 ${className}`}>
      <nav aria-label="Legal" className="mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/terms" className="hover:text-brand-green-700 hover:underline">Terms</Link>
        <Link href="/privacy" className="hover:text-brand-green-700 hover:underline">Privacy</Link>
        <Link href="/contact" className="hover:text-brand-green-700 hover:underline">Contact</Link>
      </nav>
      <p>&copy; {new Date().getFullYear()} {COMPANY.legalName}</p>
    </footer>
  );
}
