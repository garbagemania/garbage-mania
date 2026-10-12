import { LegalPage } from "@/components/brand/legal-page";
import { COMPANY, contactLines } from "@/config/company";

export const metadata = { title: "Contact · Garbage Mania" };

export default function ContactPage() {
  const lines = contactLines();
  return (
    <LegalPage title={`Contact ${COMPANY.name}`}>
      {lines.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          {lines.map((l) => (
            <div key={l.label} className="contents">
              <dt className="font-medium text-neutral-900">{l.label}</dt>
              <dd>
                {l.href ? (
                  <a href={l.href} className="text-brand-green-700 underline">{l.value}</a>
                ) : (
                  l.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>Contact details will be published here soon. Customers can also reach us through their account.</p>
      )}
    </LegalPage>
  );
}
