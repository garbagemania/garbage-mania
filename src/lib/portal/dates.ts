/** Today's date (YYYY-MM-DD) in the business timezone, Africa/Nairobi. */
export function todayNairobi(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
