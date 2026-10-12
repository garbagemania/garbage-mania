import { z } from "zod";

export const vehicleStatusSchema = z.enum(["active", "in_maintenance", "out_of_service"]);

/** Registration plates are stored upper-case with single spaces so "kda 123a" and "KDA  123A" are the same vehicle. */
const registration = z
  .string()
  .trim()
  .min(3, "Enter the registration number")
  .max(20, "Registration number is too long")
  .transform((v) => v.toUpperCase().replace(/\s+/g, " "));

export const vehicleFormSchema = z.object({
  registrationNumber: registration,
  vehicleType: z.string().trim().max(60, "Vehicle type is too long").optional().or(z.literal("")),
  // numeric(8,2) in the database holds at most 999,999.99
  capacityKg: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().positive("Capacity must be more than 0").max(999999, "Capacity is too large").optional(),
  ),
  status: vehicleStatusSchema,
});
export type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

const optionalUuid = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().uuid().optional());

export const routeFormSchema = z.object({
  name: z.string().trim().min(2, "Give the route a name").max(80, "Route name is too long"),
  area: z.string().trim().max(80, "Area is too long").optional().or(z.literal("")),
  defaultDriverId: optionalUuid,
  defaultVehicleId: optionalUuid,
  status: z.enum(["active", "inactive"]),
});
export type RouteFormValues = z.infer<typeof routeFormSchema>;

export const routeStopFormSchema = z.object({
  routeId: z.string().uuid(),
  serviceAddressId: z.string().uuid("Choose an address to add"),
});

export const scheduleRunFormSchema = z.object({
  routeId: z.string().uuid(),
  assignmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  driverId: z.string().uuid("Choose a driver"),
  vehicleId: z.string().uuid("Choose a vehicle"),
});

export const driverFormSchema = z.object({
  id: z.string().uuid(),
  licenseNumber: z.string().trim().min(3, "Enter the licence number").max(50, "Licence number is too long"),
  licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the licence expiry date"),
  status: z.enum(["active", "suspended", "inactive"]),
});
export type DriverFormValues = z.infer<typeof driverFormSchema>;
