import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDay } from "@/lib/format";
import { getPortalContext } from "@/lib/portal/customer";
import { Field, LoadError, NoCustomerAccount, Notice, label } from "@/components/portal/portal-ui";
import { updateAccount } from "./actions";

export default async function AccountPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const { supabase, user, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  const [customerRes, contactsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("display_name, customer_type, status, kra_pin, billing_email, billing_phone, created_at")
      .eq("id", customerId)
      .maybeSingle(),
    supabase
      .from("customer_contacts")
      .select("id, full_name, phone, email, contact_phone_type, receives_invoices")
      .eq("customer_id", customerId)
      .order("contact_phone_type", { ascending: true }),
  ]);

  const customer = customerRes.data;
  const contacts = contactsRes.data ?? [];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">My account</h1>
        <p className="text-sm text-neutral-600">Your details as held by Garbage Mania.</p>
      </div>

      <Notice success={searchParams.saved ? "Your details have been saved." : undefined} error={searchParams.error} />
      {customerRes.error && <LoadError message={customerRes.error.message} />}

      {!customer && !customerRes.error && (
        <p className="rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
          We couldn&apos;t find your customer record.
        </p>
      )}

      {customer && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">{customer.display_name}</Field>
                <Field label="Customer type">{label(customer.customer_type)}</Field>
                <Field label="Account status">{label(customer.status)}</Field>
                <Field label="KRA PIN">{customer.kra_pin ?? "Not provided"}</Field>
                <Field label="Login email">{user.email ?? "—"}</Field>
                <Field label="Billing email">{customer.billing_email ?? "Not provided"}</Field>
                <Field label="Billing phone">{customer.billing_phone ?? "Not provided"}</Field>
                <Field label="Customer since">{formatDay(customer.created_at)}</Field>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update your details</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateAccount} className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="displayName" className="mb-1 block text-xs font-medium text-neutral-600">
                    Name
                  </label>
                  <Input id="displayName" name="displayName" required defaultValue={customer.display_name} />
                </div>
                <div>
                  <label htmlFor="billingPhone" className="mb-1 block text-xs font-medium text-neutral-600">
                    Billing phone
                  </label>
                  <Input
                    id="billingPhone"
                    name="billingPhone"
                    required
                    inputMode="tel"
                    defaultValue={customer.billing_phone ?? ""}
                    placeholder="0712345678"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="billingEmail" className="mb-1 block text-xs font-medium text-neutral-600">
                    Billing email
                  </label>
                  <Input id="billingEmail" name="billingEmail" type="email" defaultValue={customer.billing_email ?? ""} />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">Save changes</Button>
                  <p className="mt-2 text-xs text-neutral-500">
                    Customer type and KRA PIN can&apos;t be changed here — contact Garbage Mania to change them.
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contact numbers on file</CardTitle>
        </CardHeader>
        <CardContent>
          {contactsRes.error ? (
            <LoadError message={contactsRes.error.message} />
          ) : contacts.length === 0 ? (
            <p className="text-sm text-neutral-500">No contact numbers recorded.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {contacts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium text-neutral-900">{c.phone ?? c.email ?? "—"}</span>
                    <span className="block text-xs text-neutral-500">
                      {c.full_name}
                      {c.receives_invoices ? " · receives invoices" : ""}
                    </span>
                  </span>
                  <span className="text-xs uppercase text-neutral-500">{label(c.contact_phone_type)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            Contact numbers can only be changed by Garbage Mania staff. Contact us if one needs updating.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
