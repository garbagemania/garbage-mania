/**
 * Money parsing for form input. Integer arithmetic only - no floats ever touch
 * a financial amount. Returns null when the text is not a valid amount.
 */
export function parseKesToCents(input: string | null | undefined): number | null {
  const s = (input ?? "").trim().replace(/,/g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** "16" -> 1600, "16.5" -> 1650 (basis points). Null if invalid or > 100%. */
export function parsePercentToBp(input: string | null | undefined): number | null {
  const s = (input ?? "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const bp = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return bp <= 10000 ? bp : null;
}
