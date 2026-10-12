"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signup, type SignupState } from "@/app/signup/actions";
import { BILLING_CYCLES, SERVICE_DAYS, SIGNUP_SERVICES } from "@/lib/validation/customer-signup";

const inputClass =
  "h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:border-brand-green-500";
const labelClass = "mb-1 block text-xs font-medium text-neutral-700";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-md bg-brand-green-500 px-4 text-sm font-medium text-white hover:bg-brand-green-600 disabled:opacity-60"
    >
      {pending ? "Submitting…" : "Submit application"}
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-neutral-200 p-4">
      <legend className="px-1 text-sm font-semibold text-brand-green-700">{title}</legend>
      {hint && <p className="-mt-2 text-xs text-neutral-500">{hint}</p>}
      {children}
    </fieldset>
  );
}

export function SignupForm() {
  const [state, formAction] = useFormState<SignupState, FormData>(signup, {});
  const v = state.values ?? {};
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const arr = (k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
  const type = str("customerType") || "individual";

  return (
    <form key={state.nonce ?? 0} action={formAction} className="space-y-6">
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Section title="Client details">
        <div>
          <span className={labelClass}>I am registering as</span>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="customerType" value="individual" defaultChecked={type === "individual"} /> Individual
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="customerType" value="corporate" defaultChecked={type === "corporate"} /> Corporate
            </label>
          </div>
        </div>
        <div>
          <label htmlFor="name" className={labelClass}>
            Corporate name (or your full name if individual)
          </label>
          <input id="name" name="name" required defaultValue={str("name")} className={inputClass} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className={labelClass}>
              Email address
            </label>
            <input id="email" name="email" type="email" required defaultValue={str("email")} className={inputClass} />
          </div>
          <div>
            <label htmlFor="phonePrimary" className={labelClass}>
              Phone
            </label>
            <input id="phonePrimary" name="phonePrimary" inputMode="tel" required placeholder="0712345678" defaultValue={str("phonePrimary")} className={inputClass} />
          </div>
          <div>
            <label htmlFor="phoneSecondary" className={labelClass}>
              Second phone (required)
            </label>
            <input id="phoneSecondary" name="phoneSecondary" inputMode="tel" required placeholder="0722345678" defaultValue={str("phoneSecondary")} className={inputClass} />
          </div>
        </div>
      </Section>

      <Section title="Physical address">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="county" className={labelClass}>
              County
            </label>
            <input id="county" name="county" required defaultValue={str("county")} className={inputClass} />
          </div>
          <div>
            <label htmlFor="ward" className={labelClass}>
              Ward
            </label>
            <input id="ward" name="ward" required defaultValue={str("ward")} className={inputClass} />
          </div>
          <div>
            <label htmlFor="region" className={labelClass}>
              Region
            </label>
            <input id="region" name="region" defaultValue={str("region")} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="streetName" className={labelClass}>
              Street name / road
            </label>
            <input id="streetName" name="streetName" defaultValue={str("streetName")} className={inputClass} />
          </div>
          <div>
            <label htmlFor="houseNumber" className={labelClass}>
              House no. / gate no. / apartment no.
            </label>
            <input id="houseNumber" name="houseNumber" defaultValue={str("houseNumber")} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="addressDescription" className={labelClass}>
            Any other physical address description (where applicable)
          </label>
          <input id="addressDescription" name="addressDescription" defaultValue={str("addressDescription")} className={inputClass} />
        </div>
      </Section>

      <Section title="Subscription" hint="Tick the services you'd like to subscribe to.">
        <div className="grid gap-2 sm:grid-cols-2">
          {SIGNUP_SERVICES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm text-neutral-800">
              <input type="checkbox" name="services" value={s} defaultChecked={arr("services").includes(s)} />
              {s}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Service days" hint="Tick the day(s) you prefer to get serviced.">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {SERVICE_DAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-2 text-sm text-neutral-800">
              <input type="checkbox" name="serviceDays" value={d.value} defaultChecked={arr("serviceDays").includes(String(d.value))} />
              {d.label}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Billing cycle" hint="Garbage Mania will confirm your fee and plan after approval.">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {BILLING_CYCLES.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm text-neutral-800">
              <input type="radio" name="billingCycle" value={c.value} required defaultChecked={str("billingCycle") === c.value} />
              {c.label}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Caretaker's details, C/O (if applicable)">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="caretakerName" className={labelClass}>
              Name
            </label>
            <input id="caretakerName" name="caretakerName" defaultValue={str("caretakerName")} className={inputClass} />
          </div>
          <div>
            <label htmlFor="caretakerPhone" className={labelClass}>
              Phone
            </label>
            <input id="caretakerPhone" name="caretakerPhone" inputMode="tel" defaultValue={str("caretakerPhone")} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="caretakerEmail" className={labelClass}>
              Email address
            </label>
            <input id="caretakerEmail" name="caretakerEmail" type="email" defaultValue={str("caretakerEmail")} className={inputClass} />
          </div>
        </div>
      </Section>

      <Section title="Create your login">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className={labelClass}>
              Password (at least 8 characters)
            </label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className={labelClass}>
              Confirm password
            </label>
            <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          You will be able to sign in once Garbage Mania has reviewed and approved your application.
        </p>
      </Section>

      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="acceptTerms" required className="mt-1" />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="font-medium text-brand-green-700 underline">Terms of service</Link>{" "}
          and have read the{" "}
          <Link href="/privacy" target="_blank" className="font-medium text-brand-green-700 underline">Privacy notice</Link>.
        </span>
      </label>

      <SubmitButton />

      <p className="text-center text-sm text-neutral-600">
        Already have an account?{" "}
        <Link href="/login" className="text-brand-green-600 underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
