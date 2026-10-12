import type { Area, Role } from "@/types/roles";
import { roleCanAccess, STAFF_ROLES } from "@/types/roles";
import type { AppUser } from "@/lib/auth/session";

/**
 * Thrown when a signed-in user's role/account type doesn't permit an
 * operation. Route Handlers/Server Actions should catch this and respond
 * 403. Distinct from AuthenticationError (session.ts, 401) so callers can
 * tell "not signed in" from "signed in, not allowed" apart.
 */
export class AuthorizationError extends Error {
  constructor(message = "Not authorized.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Single choke point for "is this role allowed in this route area" —
 * used by middleware.ts and area layouts for routing/UX. This is a
 * convenience layer, not the real enforcement: the authoritative boundary
 * is Postgres RLS (supabase/migrations/011_rls_policies.sql), which
 * applies regardless of whether this function was ever called. Never
 * treat a passing check here as sufficient authorization for a database
 * write — every mutation still goes through a Supabase client bound by
 * RLS.
 */
export function assertAreaAccess(role: Role | null, area: Area): void {
  if (!role || !roleCanAccess(role, area)) {
    throw new AuthorizationError(`Role "${role ?? "none"}" cannot access the "${area}" area.`);
  }
}

/**
 * Requires the user to have one of `allowed` roles. With no `allowed`
 * argument, requires any signed-in role (i.e. just "has a role at all").
 */
export function requireRole(user: AppUser, allowed?: Role[]): void {
  if (!user.role || (allowed && !allowed.includes(user.role))) {
    const wanted = allowed ? allowed.join(", ") : "any role";
    throw new AuthorizationError(
      `Requires role in [${wanted}], user has "${user.role ?? "none"}".`,
    );
  }
}

/**
 * Requires a staff account (any non-customer role). Optionally narrow to a
 * specific subset of staff roles, e.g. requireStaffRole(user, ["finance"]).
 */
export function requireStaffRole(user: AppUser, allowed: Role[] = STAFF_ROLES): void {
  if (user.kind !== "staff") {
    throw new AuthorizationError("Requires a staff account.");
  }
  requireRole(user, allowed);
}

/** Requires a customer account. Returns the resolved customer_id for convenience. */
export function requireCustomer(user: AppUser): string {
  if (user.kind !== "customer" || user.role !== "customer" || !user.customerProfile) {
    throw new AuthorizationError("Requires a customer account.");
  }
  return user.customerProfile.customerId;
}

/** Requires a driver account (staff, role "driver", with a linked drivers row). */
export function requireDriver(user: AppUser): DriverInfoOrThrow {
  if (user.role !== "driver" || !user.driver) {
    throw new AuthorizationError("Requires a driver account.");
  }
  return user.driver;
}

type DriverInfoOrThrow = NonNullable<AppUser["driver"]>;

export { roleCanAccess };
