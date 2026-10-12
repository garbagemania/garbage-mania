/**
 * Structured logging foundation.
 *
 * Emits single-line JSON so logs are greppable and ready to ship to a log
 * aggregator later (e.g. Logtail, Axiom, Supabase log drains) without
 * changing call sites. Never log secrets, full card/account numbers, or raw
 * M-Pesa credentials — pass identifiers (customer id, invoice id) instead of
 * whole payloads.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const line = JSON.stringify(entry);

  switch (level) {
    case "error":
      // eslint-disable-next-line no-console
      console.error(line);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(line);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
