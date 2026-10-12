import { logger } from "@/lib/logger";

/**
 * Turns database/driver errors into something a customer or accountant can
 * act on. Business-rule messages that our own SQL functions raise on purpose
 * (e.g. "Credit notes would exceed the invoice total") pass straight through;
 * technical Postgres/PostgREST text is hidden from the screen and logged on
 * the server instead.
 */
const PERMISSION = /row-level security|permission denied|not allowed to|42501/i;
const DUPLICATE = /duplicate key|already exists/i;
const TECHNICAL =
  /violates|constraint|relation ".*"|column ".*"|syntax error|invalid input syntax|null value in column|does not exist|could not serialize|deadlock|JWT|PGRST|schema cache|foreign key|FetchError|fetch failed/i;

export function friendlyError(
  message: string | null | undefined,
  fallback = "Something went wrong. Please try again, and contact us if it keeps happening.",
): string {
  const text = (message ?? "").trim();
  if (!text) return fallback;

  if (PERMISSION.test(text)) {
    // "Not allowed to ..." from our own functions is already readable.
    if (/^not allowed to /i.test(text)) return text;
    logger.warn("permission error hidden from user", { detail: text });
    return "You don't have permission to do that.";
  }
  if (DUPLICATE.test(text) && TECHNICAL.test(text)) {
    logger.warn("duplicate error hidden from user", { detail: text });
    return "That already exists. Please check and try again.";
  }
  if (TECHNICAL.test(text)) {
    logger.error("database error hidden from user", { detail: text });
    return fallback;
  }
  return text;
}
