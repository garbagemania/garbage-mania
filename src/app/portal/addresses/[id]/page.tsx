import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPortalContext } from "@/lib/portal/customer";
import { AddressFields } from "@/components/portal/address-fields";
import { LoadError, NoCustomerAccount, Notice } from "@/components/portal/portal-ui";
import { updateAddress } from "../actions";

export default async function EditAddressPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  if (!z.string().uuid().safeParse(params.id).success) notFound();

  const { supabase, customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  // Scoped by RLS and an explicit customer_id filter: another customer's id simply returns no row.
  const { data: address, error } = await supabase
    .from("service_addresses")
    .select("id, property_id, label, access_notes")
    .eq("id", params.id)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) return <LoadError message={error.message} />;
  if (!address) notFound();

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, property_type, address_line, ward, sub_county, county")
    .eq("id", address.property_id)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (propertyError) return <LoadError message={propertyError.message} />;
  if (!property) notFound();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Edit {address.label}</h1>
        <p className="text-sm text-neutral-600">
          To change the label or access notes for this address, contact Garbage Mania.
        </p>
      </div>
      <Notice error={searchParams.error} />
      <Card>
        <CardContent>
          <form action={updateAddress} className="space-y-4">
            <input type="hidden" name="propertyId" value={property.id} />
            <input type="hidden" name="serviceAddressId" value={address.id} />
            <AddressFields
              includeLabelAndNotes={false}
              defaults={{
                propertyType: property.property_type,
                county: property.county,
                subCounty: property.sub_county,
                ward: property.ward,
                addressLine: property.address_line,
              }}
            />
            <div className="flex gap-3">
              <Button type="submit">Save changes</Button>
              <Link href="/portal/addresses">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
