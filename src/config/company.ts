/**
 * Company details shown on the Contact page, legal pages and printed
 * statements. Nothing here is invented: contact fields come from env vars and
 * are simply hidden until you set them (see .env.example).
 */
export const COMPANY = {
  name: "Garbage Mania",
  legalName: "Garbage Mania Services Ltd",
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL ?? "",
  phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? "",
  whatsapp: process.env.NEXT_PUBLIC_COMPANY_WHATSAPP ?? "",
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "",
  hours: process.env.NEXT_PUBLIC_COMPANY_HOURS ?? "",
} as const;

/** Only the contact fields that have actually been filled in. */
export function contactLines(): { label: string; value: string; href?: string }[] {
  const lines: { label: string; value: string; href?: string }[] = [];
  if (COMPANY.phone) lines.push({ label: "Phone", value: COMPANY.phone, href: `tel:${COMPANY.phone.replace(/\s+/g, "")}` });
  if (COMPANY.whatsapp)
    lines.push({ label: "WhatsApp", value: COMPANY.whatsapp, href: `https://wa.me/${COMPANY.whatsapp.replace(/[^\d]/g, "")}` });
  if (COMPANY.email) lines.push({ label: "Email", value: COMPANY.email, href: `mailto:${COMPANY.email}` });
  if (COMPANY.address) lines.push({ label: "Address", value: COMPANY.address });
  if (COMPANY.hours) lines.push({ label: "Hours", value: COMPANY.hours });
  return lines;
}
