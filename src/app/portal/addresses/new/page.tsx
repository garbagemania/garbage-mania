import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPortalContext } from "@/lib/portal/customer";
import { AddressFields } from "@/components/portal/address-fields";
import { NoCustomerAccount, Notice } from "@/components/portal/portal-ui";
import { addAddress } from "../actions";

export default async function NewAddressPage({ searchParams }: { searchParams: { error?: string } }) {
  const { customerId } = await getPortalContext();
  if (!customerId) return <NoCustomerAccount />;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Add a service address</h1>
        <p className="text-sm text-neutral-600">Our team will see this address and can schedule collections there.</p>
      </div>
      <Notice error={searchParams.error} />
      <Card>
        <CardContent>
          <form action={addAddress} className="space-y-4">
            <AddressFields includeLabelAndNotes />
            <div className="flex gap-3">
              <Button type="submit">Save address</Button>
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
