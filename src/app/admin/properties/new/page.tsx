import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { PageHeader } from "@/components/admin/page-kit";
import { Field, FormMessage, selectClass } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createPropertyFromList } from "../actions";

export const metadata = { title: "Add property · Garbage Mania" };

export default async function NewPropertyPage({ searchParams }: { searchParams: { error?: string; customerId?: string } }) {
  await requirePageRoles(["super_admin", "admin", "operations_manager"]);
  const supabase = createSupabaseServerClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, display_name")
    .order("display_name", { ascending: true })
    .limit(500);

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm"><Link href="/admin/properties" className="text-brand-green-700">← Properties</Link></p>
      <PageHeader title="Add property" description="Attach a property to a customer. You can add its service addresses (e.g. “Front gate”) on the customer's page afterwards." />
      <FormMessage error={searchParams.error} />
      <Card>
        <CardContent>
          {(customers ?? []).length === 0 ? (
            <p className="text-sm text-neutral-600">
              There are no customers yet. <Link href="/admin/customers/new" className="text-brand-green-700">Add a customer</Link> first.
            </p>
          ) : (
            <form action={createPropertyFromList} className="space-y-4">
              <Field id="customerId" label="Customer">
                <select id="customerId" name="customerId" required defaultValue={searchParams.customerId ?? ""} className={selectClass}>
                  <option value="" disabled>Choose a customer…</option>
                  {(customers ?? []).map((c) => (<option key={c.id} value={c.id}>{c.display_name}</option>))}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="propertyType" label="Type">
                  <select id="propertyType" name="propertyType" required defaultValue="residential" className={selectClass}>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="industrial">Industrial</option>
                    <option value="institutional">Institutional</option>
                  </select>
                </Field>
                <Field id="name" label="Property name (optional)">
                  <Input id="name" name="name" maxLength={120} placeholder="e.g. Greenfield Apartments" />
                </Field>
              </div>
              <Field id="addressLine" label="Address">
                <Input id="addressLine" name="addressLine" required maxLength={200} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="ward" label="Ward (optional)"><Input id="ward" name="ward" /></Field>
                <Field id="subCounty" label="Sub-county (optional)"><Input id="subCounty" name="subCounty" /></Field>
                <Field id="county" label="County"><Input id="county" name="county" defaultValue="Nairobi" /></Field>
              </div>
              <Button type="submit">Add property</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
