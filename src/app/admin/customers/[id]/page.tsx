import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCustomerContact,
  createProperty,
  createServiceAddress,
  updateCustomerStatus,
} from "../actions";

const CAN_EDIT_CUSTOMER = ["super_admin", "admin"];
const CAN_MANAGE_PROPERTIES = ["super_admin", "admin", "operations_manager"];

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireAuthenticatedUser();
  const supabase = createSupabaseServerClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, customer_type, display_name, kra_pin, billing_email, billing_phone, status, notes, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!customer) notFound();

  const [{ data: contacts }, { data: properties }, { data: subscriptions }, { data: recentCollections }] =
    await Promise.all([
      supabase
        .from("customer_contacts")
        .select("id, full_name, title, email, phone, receives_invoices, contact_phone_type")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("properties")
        .select(
          "id, property_type, name, address_line, ward, sub_county, county, status, service_addresses ( id, label, status, access_notes )",
        )
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("subscriptions")
        .select("id, status, frequency, start_date, service_plans ( name ), service_addresses ( label )")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("collections")
        .select("id, scheduled_date, status, service_addresses!inner ( label, customer_id )")
        .eq("service_addresses.customer_id", customer.id)
        .order("scheduled_date", { ascending: false })
        .limit(10),
    ]);

  const canEditCustomer = user.role ? CAN_EDIT_CUSTOMER.includes(user.role) : false;
  const canManageProperties = user.role ? CAN_MANAGE_PROPERTIES.includes(user.role) : false;

  return (
    <div className="space-y-6">
      {searchParams.error && (
        <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">{searchParams.error}</p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{customer.display_name}</CardTitle>
            <p className="mt-1 text-sm capitalize text-neutral-600">{customer.customer_type} customer</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={customer.status === "active" ? "success" : customer.status === "suspended" ? "warning" : "neutral"}>
              {customer.status}
            </Badge>
            {canEditCustomer && (
              <Link href={`/admin/customers/${customer.id}/edit`}>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-neutral-500">Billing email</p>
            <p className="text-neutral-900">{customer.billing_email ?? "—"}</p>
          </div>
          <div>
            <p className="text-neutral-500">Billing phone</p>
            <p className="text-neutral-900">{customer.billing_phone ?? "—"}</p>
          </div>
          {customer.kra_pin && (
            <div>
              <p className="text-neutral-500">KRA PIN</p>
              <p className="text-neutral-900">{customer.kra_pin}</p>
            </div>
          )}
          {customer.notes && (
            <div className="sm:col-span-2">
              <p className="text-neutral-500">Notes</p>
              <p className="whitespace-pre-wrap text-neutral-900">{customer.notes}</p>
            </div>
          )}
        </CardContent>
        {canEditCustomer && (
          <CardContent className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
            {(["active", "suspended", "closed"] as const)
              .filter((s) => s !== customer.status)
              .map((status) => (
                <form key={status} action={updateCustomerStatus.bind(null, customer.id, status)}>
                  <Button type="submit" variant="outline" size="sm">
                    Mark {status}
                  </Button>
                </form>
              ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contacts && contacts.length > 0 ? (
            <ul className="divide-y divide-neutral-100">
              {contacts.map((c) => (
                <li key={c.id} className="py-2 text-sm">
                  <p className="font-medium text-neutral-900">
                    {c.full_name} {c.title && <span className="font-normal text-neutral-500">— {c.title}</span>}
                  </p>
                  <p className="text-neutral-600">
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                    {c.contact_phone_type && (
                      <span className="ml-2 text-xs capitalize text-neutral-400">({c.contact_phone_type})</span>
                    )}
                  </p>
                  {c.receives_invoices && (
                    <Badge tone="info" className="mt-1">
                      Receives invoices
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No contacts recorded yet.</p>
          )}
          {canEditCustomer && (
            <details className="rounded-md border border-neutral-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-green-700">Add contact</summary>
              <form action={createCustomerContact.bind(null, customer.id)} className="mt-3 space-y-2">
                <Input name="fullName" placeholder="Full name" required />
                <Input name="title" placeholder="Title (optional)" />
                <Input name="email" type="email" placeholder="Email (optional)" />
                <Input name="phonePrimary" placeholder="Primary phone (required)" required />
                <Input name="phoneSecondary" placeholder="Secondary phone (required)" required />
                <Input name="phoneTertiary" placeholder="Third phone (optional)" />
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" name="receivesInvoices" />
                  Receives invoices
                </label>
                <Button type="submit" size="sm">
                  Add contact
                </Button>
              </form>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Properties &amp; service addresses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {properties && properties.length > 0 ? (
            <div className="space-y-4">
              {properties.map((property) => (
                <div key={property.id} className="rounded-md border border-neutral-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-neutral-900">
                      {property.name ?? property.address_line}{" "}
                      <span className="font-normal capitalize text-neutral-500">({property.property_type})</span>
                    </p>
                    <Badge tone={property.status === "active" ? "success" : "neutral"}>{property.status}</Badge>
                  </div>
                  <p className="text-sm text-neutral-600">
                    {[property.address_line, property.ward, property.sub_county, property.county]
                      .filter(Boolean)
                      .join(", ")}
                  </p>

                  <div className="mt-2 space-y-1">
                    {(property.service_addresses ?? []).map((sa) => (
                      <div key={sa.id} className="rounded bg-neutral-50 px-2 py-1 text-sm">
                        <span className="font-medium">{sa.label}</span>
                        {sa.access_notes && <span className="text-neutral-500"> — {sa.access_notes}</span>}
                        <Badge tone={sa.status === "active" ? "success" : "neutral"} className="ml-2">
                          {sa.status}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {canManageProperties && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-brand-green-700">
                        Add service address
                      </summary>
                      <form
                        action={createServiceAddress.bind(null, customer.id, property.id)}
                        className="mt-2 flex flex-wrap items-end gap-2"
                      >
                        <Input name="label" placeholder="e.g. Front gate" required className="w-40" />
                        <Input name="accessNotes" placeholder="Access notes (optional)" className="w-52" />
                        <Button type="submit" size="sm" variant="outline">
                          Add
                        </Button>
                      </form>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No properties recorded yet.</p>
          )}

          {canManageProperties && (
            <details className="rounded-md border border-neutral-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-green-700">Add property</summary>
              <form action={createProperty.bind(null, customer.id)} className="mt-3 space-y-2">
                <select
                  name="propertyType"
                  required
                  defaultValue="residential"
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="industrial">Industrial</option>
                  <option value="institutional">Institutional</option>
                </select>
                <Input name="name" placeholder="Property name (optional)" />
                <Input name="addressLine" placeholder="Address" required />
                <div className="grid grid-cols-2 gap-2">
                  <Input name="ward" placeholder="Ward (optional)" />
                  <Input name="subCounty" placeholder="Sub-county (optional)" />
                </div>
                <Input name="county" placeholder="County" defaultValue="Nairobi" />
                <div className="grid grid-cols-2 gap-2">
                  <Input name="latitude" placeholder="Latitude (optional)" />
                  <Input name="longitude" placeholder="Longitude (optional)" />
                </div>
                <Button type="submit" size="sm">
                  Add property
                </Button>
              </form>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Subscriptions</CardTitle>
          <Link href={`/admin/subscriptions/new?customerId=${customer.id}`}>
            <Button size="sm" variant="outline">
              New subscription
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {subscriptions && subscriptions.length > 0 ? (
            <ul className="divide-y divide-neutral-100">
              {subscriptions.map((sub) => (
                <li key={sub.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/admin/subscriptions/${sub.id}`} className="font-medium text-brand-green-700">
                      {sub.service_plans?.name ?? "Service plan"}
                    </Link>
                    <p className="text-neutral-500">
                      {sub.service_addresses?.label} · {sub.frequency} · since {sub.start_date}
                    </p>
                  </div>
                  <Badge
                    tone={sub.status === "active" ? "success" : sub.status === "cancelled" ? "neutral" : "warning"}
                  >
                    {sub.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No subscriptions yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent collections</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCollections && recentCollections.length > 0 ? (
            <ul className="divide-y divide-neutral-100">
              {recentCollections.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-neutral-700">
                    {c.scheduled_date} · {c.service_addresses?.label}
                  </span>
                  <Badge
                    tone={
                      c.status === "completed"
                        ? "success"
                        : c.status === "failed" || c.status === "cancelled"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {c.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No collections recorded yet for this customer.</p>
          )}
        </CardContent>
      </Card>

      {(user.role === "super_admin" || user.role === "admin" || user.role === "finance") && (
        <p className="text-sm text-neutral-600">
          Invoices, payments and statements for this customer are in{" "}
          <Link href={`/admin/finance/customers/${customer.id}`} className="font-medium text-brand-green-700">
            their finance account
          </Link>
          .
        </p>
      )}
    </div>
  );
}
