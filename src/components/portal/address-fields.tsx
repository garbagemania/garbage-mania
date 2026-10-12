import { Input } from "@/components/ui/input";

const PROPERTY_TYPES = ["residential", "commercial", "industrial", "institutional"] as const;

interface Defaults {
  label?: string;
  propertyType?: string;
  county?: string;
  subCounty?: string | null;
  ward?: string | null;
  addressLine?: string;
  accessNotes?: string | null;
}

const labelClass = "mb-1 block text-xs font-medium text-neutral-600";

export function AddressFields({ defaults = {}, includeLabelAndNotes }: { defaults?: Defaults; includeLabelAndNotes: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {includeLabelAndNotes && (
        <div className="sm:col-span-2">
          <label htmlFor="label" className={labelClass}>
            Address label (e.g. Home, Shop, Office)
          </label>
          <Input id="label" name="label" required defaultValue={defaults.label ?? ""} />
        </div>
      )}
      <div>
        <label htmlFor="propertyType" className={labelClass}>
          Property type
        </label>
        <select
          id="propertyType"
          name="propertyType"
          defaultValue={defaults.propertyType ?? "residential"}
          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="county" className={labelClass}>
          County
        </label>
        <Input id="county" name="county" required defaultValue={defaults.county ?? ""} />
      </div>
      <div>
        <label htmlFor="subCounty" className={labelClass}>
          Sub-county
        </label>
        <Input id="subCounty" name="subCounty" defaultValue={defaults.subCounty ?? ""} />
      </div>
      <div>
        <label htmlFor="ward" className={labelClass}>
          Ward
        </label>
        <Input id="ward" name="ward" defaultValue={defaults.ward ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="addressLine" className={labelClass}>
          Physical address
        </label>
        <textarea
          id="addressLine"
          name="addressLine"
          required
          rows={3}
          defaultValue={defaults.addressLine ?? ""}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        />
      </div>
      {includeLabelAndNotes && (
        <div className="sm:col-span-2">
          <label htmlFor="accessNotes" className={labelClass}>
            Access notes for the collection crew (optional)
          </label>
          <textarea
            id="accessNotes"
            name="accessNotes"
            rows={2}
            defaultValue={defaults.accessNotes ?? ""}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}
