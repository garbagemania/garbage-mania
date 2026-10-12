import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createServicePlan } from "../actions";

export default function NewServicePlanPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">New service plan</h1>

      <Card>
        <CardHeader>
          <CardTitle>Plan details</CardTitle>
        </CardHeader>
        <CardContent>
          {searchParams.error && (
            <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{searchParams.error}</p>
          )}
          <form action={createServicePlan} className="space-y-4">
            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-neutral-700">
                Code
              </label>
              <Input id="code" name="code" required placeholder="RES-WEEKLY-240L" />
            </div>
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-neutral-700">
                Name
              </label>
              <Input id="name" name="name" required placeholder="Weekly residential, 240L bin" />
            </div>
            <div>
              <label htmlFor="wasteType" className="mb-1 block text-sm font-medium text-neutral-700">
                Waste type
              </label>
              <select
                id="wasteType"
                name="wasteType"
                required
                defaultValue="general"
                className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
              >
                <option value="general">General</option>
                <option value="recyclable">Recyclable</option>
                <option value="organic">Organic</option>
                <option value="hazardous">Hazardous</option>
                <option value="bulky">Bulky</option>
              </select>
            </div>
            <div>
              <label htmlFor="containerType" className="mb-1 block text-sm font-medium text-neutral-700">
                Container type
              </label>
              <Input id="containerType" name="containerType" placeholder="240L bin, skip, etc. (optional)" />
            </div>
            <div>
              <label htmlFor="defaultFrequency" className="mb-1 block text-sm font-medium text-neutral-700">
                Default frequency
              </label>
              <select
                id="defaultFrequency"
                name="defaultFrequency"
                required
                defaultValue="weekly"
                className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="on_demand">On demand</option>
              </select>
            </div>
            <div>
              <label htmlFor="priceKes" className="mb-1 block text-sm font-medium text-neutral-700">
                Initial price (KES)
              </label>
              <Input id="priceKes" name="priceKes" type="number" min={0} step="0.01" required placeholder="2500" />
              <p className="mt-1 text-xs text-neutral-500">
                Entered in whole KES; stored as cents internally — enter e.g. 2500 for KES 2,500.00.
              </p>
            </div>
            <Button type="submit" className="w-full">
              Create plan
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
