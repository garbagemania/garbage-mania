import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/customer";
import { completeOnboarding } from "./actions";

export default async function OnboardingPage({ searchParams }: { searchParams: { error?: string } }) {
  const { supabase, customerId } = await getPortalContext();

  // Already registered customers go straight to the portal instead of
  // seeing the form again (and creating a duplicate address/contact set).
  if (customerId) {
    const [property, contact] = await Promise.all([
      supabase.from("properties").select("id").eq("customer_id", customerId).limit(1),
      supabase.from("customer_contacts").select("id").eq("customer_id", customerId).limit(1),
    ]);
    if ((property.data ?? []).length > 0 && (contact.data ?? []).length > 0) redirect("/portal");
  }

  return (
    <main className="min-h-screen bg-gray-50 flex justify-center p-8">

      <div className="bg-white border rounded-lg shadow p-8 w-full max-w-xl">

        <h1 className="text-2xl font-bold text-green-800 mb-6">
          Customer Registration Details
        </h1>

        {searchParams.error && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{searchParams.error}</p>
        )}

        <form action={completeOnboarding} className="space-y-4">

          <input
            name="displayName"
            placeholder="Name / Company Name"
            required
            className="w-full border p-3 rounded"
          />

          <select
            name="customerType"
            className="w-full border p-3 rounded"
          >
            <option value="individual">
              Individual
            </option>

            <option value="corporate">
              Corporate
            </option>
          </select>


          <input
            name="kraPin"
            placeholder="KRA PIN"
            className="w-full border p-3 rounded"
          />


          <input
            name="phone1"
            placeholder="Primary Phone Number"
            required
            className="w-full border p-3 rounded"
          />


          <input
            name="phone2"
            placeholder="Secondary Phone Number"
            required
            className="w-full border p-3 rounded"
          />


          <input
            name="phone3"
            placeholder="Third Phone Number (Optional)"
            className="w-full border p-3 rounded"
          />


          <input
            name="county"
            placeholder="County"
            required
            className="w-full border p-3 rounded"
          />


          <input
            name="subCounty"
            placeholder="Sub County"
            required
            className="w-full border p-3 rounded"
          />


          <input
            name="ward"
            placeholder="Ward"
            required
            className="w-full border p-3 rounded"
          />


          <textarea
            name="address"
            placeholder="Physical Address"
            required
            className="w-full border p-3 rounded"
          />


          <button
            className="w-full bg-green-700 text-white p-3 rounded"
          >
            Complete Registration
          </button>

        </form>

      </div>

    </main>
  );
}
