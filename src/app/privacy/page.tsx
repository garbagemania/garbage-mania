import { LegalPage } from "@/components/brand/legal-page";
import { COMPANY } from "@/config/company";

export const metadata = { title: "Privacy notice · Garbage Mania" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="October 2026">
      <p>
        {COMPANY.legalName} (&quot;we&quot;) provides waste collection services. This notice explains what personal
        data we collect, why, and the choices you have, in line with the Kenya Data Protection Act, 2019.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name, phone numbers and email address, and the same details for a caretaker if you give them.</li>
        <li>Your service address, area and any directions you provide.</li>
        <li>The services, collection days and billing cycle you choose.</li>
        <li>Billing records: invoices, payments, refunds and statements. If you pay by M-Pesa, the payment reference and phone number used.</li>
        <li>Collection records, such as when we collected and any photos or notes our drivers add.</li>
        <li>Your sign-in details. Passwords are stored in protected form; we cannot read them.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To review your application and provide the collection service you asked for.</li>
        <li>To invoice you, record payments and keep accurate financial records.</li>
        <li>To contact you about your service, for example a missed collection or a change to your schedule.</li>
        <li>To keep the platform secure and to meet legal and accounting obligations.</li>
      </ul>

      <h2>Who sees it</h2>
      <p>
        Only our staff who need the data for their job can see it, and a customer can only see their own account. We
        use trusted providers to run the platform (hosting and database), and, where you pay or are messaged through
        them, payment and messaging providers. We do not sell your personal data.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep account and service records while you are a customer. Financial records are kept for the period
        required by Kenyan tax and accounting law, even after you leave.
      </p>

      <h2>Your rights</h2>
      <p>
        You may ask to see the data we hold about you, correct it, object to certain uses, or ask us to delete it where
        the law allows. Contact us (see below) and we will respond within a reasonable time. You also have the right to
        complain to the Office of the Data Protection Commissioner (ODPC) in Kenya.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this notice: see our <a className="font-medium text-brand-green-700 underline" href="/contact">Contact page</a>.
      </p>
    </LegalPage>
  );
}
