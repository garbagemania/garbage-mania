import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPortalContext } from "@/lib/portal/customer";
import { EmptyState, LoadError, NoCustomerAccount, Notice, label } from "@/components/portal/portal-ui";

export default async function AddressesPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const { supabase, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  const [addressesRes, propertiesRes] = await Promise.all([
    supabase
      .from("service_addresses")
      .select("id, property_id, label, access_notes, status")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("properties")
      .select("id, property_type, name, address_line, ward, sub_county, county, status")
      .eq("customer_id", customerId),
  ]);

  const properties = new Map((propertiesRes.data ?? []).map((p) => [p.id, p]));
  const addresses = addressesRes.data ?? [];
  const error = addressesRes.error?.message ?? propertiesRes.error?.message;

  const saved =
    searchParams.saved === "added" ? "Address added." : searchParams.saved === "updated" ? "Address updated." : undefined;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Service addresses</h1>
          <p className="text-sm text-neutral-600">Where Garbage Mania collects your waste.</p>
        </div>
        <Link href="/portal/addresses/new">
          <Button>Add address</Button>
        </Link>
      </div>

      <Notice success={saved} error={searchParams.error} />
      {error && <LoadError message={error} />}

      {!error && addresses.length === 0 && <EmptyState>No service addresses yet. Add your first address to get started.</EmptyState>}

      <div className="grid gap-4 md:grid-cols-2">
        {addresses.map((a) => {
          const p = properties.get(a.property_id);
          return (
            <Card key={a.id}>
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-neutral-900">{a.label}</h2>
                  <Badge tone={a.status === "active" ? "success" : "neutral"}>{a.status}</Badge>
                </div>
                {p ? (
                  <dl className="space-y-1 text-sm text-neutral-700">
                    <p>
                      <span className="font-medium">Property:</span> {p.name ?? "—"} ({label(p.property_type)})
                    </p>
                    <p>
                      <span className="font-medium">Address:</span> {p.address_line}
                    </p>
                    <p>
                      <span className="font-medium">Location:</span>{" "}
                      {[p.ward, p.sub_county, p.county].filter(Boolean).join(", ")}
                    </p>
                    {p.status !== "active" && <p className="text-neutral-500">Property is inactive.</p>}
                  </dl>
                ) : (
                  <p className="text-sm text-neutral-500">Property details unavailable.</p>
                )}
                {a.access_notes && (
                  <p className="text-sm text-neutral-600">
                    <span className="font-medium">Access notes:</span> {a.access_notes}
                  </p>
                )}
                <Link href={`/portal/addresses/${a.id}`} className="inline-block text-sm text-brand-green-600 hover:underline">
                  Edit address
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
