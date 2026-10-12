import { LegalPage } from "@/components/brand/legal-page";
import { COMPANY } from "@/config/company";

export const metadata = { title: "Terms of service · Garbage Mania" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="October 2026">
      <p>
        These terms apply when you apply for or use a {COMPANY.legalName} account. By submitting the sign-up form you
        agree to them.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Applications are reviewed by us. You can sign in only after we confirm your account.</li>
        <li>Give accurate details and keep your password private. You are responsible for activity on your account.</li>
        <li>Tell us promptly if your address, phone number or email changes.</li>
      </ul>

      <h2>Collections</h2>
      <ul>
        <li>We collect on the schedule agreed for your plan. Put waste out at the agreed point and time.</li>
        <li>We may skip or reschedule a collection for safety, weather or access reasons, or if the waste is not what was agreed.</li>
        <li>We do not collect hazardous, medical or other restricted waste unless we have agreed to in writing.</li>
      </ul>

      <h2>Fees and payment</h2>
      <ul>
        <li>Fees follow your plan and billing cycle. We issue invoices and statements you can view in your account.</li>
        <li>Payments are recorded against your account once confirmed. Credit notes and refunds are issued at our discretion in line with the invoice records.</li>
        <li>We may suspend service for unpaid invoices after notifying you.</li>
      </ul>

      <h2>Ending service</h2>
      <p>You may ask to stop service at any time; invoices already issued remain payable. We may end service if these terms are broken.</p>

      <h2>Liability</h2>
      <p>
        We take reasonable care in providing the service. To the extent the law allows, we are not liable for indirect
        losses, and nothing here limits rights you have under Kenyan consumer law.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will post the new version here. Questions: see our{" "}
        <a className="font-medium text-brand-green-700 underline" href="/contact">Contact page</a>. How we handle your
        data is explained in our <a className="font-medium text-brand-green-700 underline" href="/privacy">Privacy notice</a>.
      </p>
    </LegalPage>
  );
}
