"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { customerSignupSchema, readSignupForm } from "@/lib/validation/customer-signup";

export interface SignupState {
  error?: string;
  /** Echoed back so the (long) form is not lost on an error. Never includes passwords. */
  values?: Record<string, string | string[]>;
  nonce?: number;
}

/**
 * Customer self-signup. Creates the Supabase auth user with the whole form
 * as metadata; the handle_new_customer_signup() trigger
 * (017_customer_signup_approval.sql) then creates the profile, a PENDING
 * customer, contacts, address and the signup request in one transaction.
 *
 * Approval is NOT decided here and cannot be skipped from here: it is
 * enforced in the database (customer_id()/owns_service_address() return
 * nothing for a customer who is not approved). The user is signed straight
 * back out so nobody stays logged in on a pending account.
 */
export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const raw = readSignupForm(formData);
  const { password: _p, confirmPassword: _c, ...echo } = raw;
  const values = { ...echo, serviceDays: echo.serviceDays.map(String) } as Record<string, string | string[]>;
  const nonce = Date.now();

  if (formData.get("acceptTerms") !== "on") {
    return { error: "Please accept the Terms of service and Privacy notice to continue.", values, nonce };
  }

  const parsed = customerSignupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again.", values, nonce };
  }
  const v = parsed.data;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      data: {
        customer_type: v.customerType,
        full_name: v.name,
        phone_primary: v.phonePrimary,
        phone_secondary: v.phoneSecondary,
        county: v.county,
        ward: v.ward,
        region: v.region || null,
        street_name: v.streetName || null,
        house_number: v.houseNumber || null,
        address_description: v.addressDescription || null,
        requested_services: v.services,
        service_days: v.serviceDays,
        billing_cycle: v.billingCycle,
        caretaker_name: v.caretakerName || null,
        caretaker_phone: v.caretakerPhone || null,
        caretaker_email: v.caretakerEmail || null,
        terms_accepted_at: new Date().toISOString(),
      },
    },
  });

  if (error) {
    const message = /already registered|already been registered/i.test(error.message)
      ? "An account with this email already exists. Try signing in instead."
      : /database error/i.test(error.message)
        ? "We couldn't create your account. Please check your details and try again."
        : error.message;
    return { error: message, values, nonce };
  }

  // With email-enumeration protection Supabase returns a user with no
  // identities for an address that already exists.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: "An account with this email already exists. Try signing in instead.", values, nonce };
  }

  await supabase.auth.signOut();
  redirect("/signup/submitted");
}
