import { describe, expect, it } from "vitest";
import { parseKesToCents, parsePercentToBp } from "@/lib/money";

describe("parseKesToCents", () => {
  it("parses whole and fractional amounts exactly", () => {
    expect(parseKesToCents("10000")).toBe(1000000);
    expect(parseKesToCents("1,234.5")).toBe(123450);
    expect(parseKesToCents("0.07")).toBe(7);
    expect(parseKesToCents("19.99")).toBe(1999);
  });
  it("rejects invalid input", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "1.", ".5", null, undefined]) {
      expect(parseKesToCents(bad as string | null | undefined)).toBeNull();
    }
  });
});

describe("parsePercentToBp", () => {
  it("converts percentages to basis points", () => {
    expect(parsePercentToBp("16")).toBe(1600);
    expect(parsePercentToBp("16.5")).toBe(1650);
    expect(parsePercentToBp("0")).toBe(0);
    expect(parsePercentToBp("100")).toBe(10000);
  });
  it("rejects invalid or >100%", () => {
    for (const bad of ["", "101", "-1", "abc", "1.234"]) expect(parsePercentToBp(bad)).toBeNull();
  });
});
