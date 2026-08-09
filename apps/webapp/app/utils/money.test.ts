/**
 * Tests for riyal/halala money handling.
 *
 * Written around the property that justifies the whole module: amounts that
 * would drift as floats must stay exact. The float-comparison tests below are
 * the ones worth keeping if the suite is ever trimmed.
 *
 * @see {@link file://./money.ts}
 */

import { describe, expect, it } from "vitest";
import {
  formatHalalas,
  halalasToRiyals,
  lineTotal,
  parseRiyalParts,
  toHalalas,
  toRiyalParts,
} from "./money";

describe("toHalalas / toRiyalParts", () => {
  it("round-trips an amount through both columns", () => {
    const parts = { riyals: 1234, halalas: 56 };

    expect(toRiyalParts(toHalalas(parts))).toEqual(parts);
  });

  it("handles a whole-riyal amount with no halalas", () => {
    expect(toHalalas({ riyals: 500, halalas: 0 })).toBe(50_000);
    expect(toRiyalParts(50_000)).toEqual({ riyals: 500, halalas: 0 });
  });

  it("handles an amount below one riyal", () => {
    expect(toHalalas({ riyals: 0, halalas: 75 })).toBe(75);
    expect(toRiyalParts(75)).toEqual({ riyals: 0, halalas: 75 });
  });

  it("handles zero", () => {
    expect(toHalalas({ riyals: 0, halalas: 0 })).toBe(0);
    expect(toRiyalParts(0)).toEqual({ riyals: 0, halalas: 0 });
  });
});

describe("integer arithmetic stays exact", () => {
  it("sums amounts that would drift as floats", () => {
    // 0.10 + 0.20 !== 0.30 in binary floating point. In halalas it is 10 + 20.
    const total =
      toHalalas({ riyals: 0, halalas: 10 }) +
      toHalalas({ riyals: 0, halalas: 20 });

    expect(total).toBe(30);
    expect(formatHalalas(total)).toBe("0.30");
  });

  it("multiplies a fractional unit price without error", () => {
    // 3 × 10.10 is 30.299999999999997 as a float.
    const unitPrice = toHalalas({ riyals: 10, halalas: 10 });

    expect(lineTotal(unitPrice, 3)).toBe(3_030);
    expect(formatHalalas(lineTotal(unitPrice, 3))).toBe("30.30");
  });

  it("keeps a hundred repeated additions exact", () => {
    // The classic accumulation case: 0.01 added 100 times is not 1.00 as a float.
    let total = 0;
    for (let i = 0; i < 100; i++) total += 1;

    expect(total).toBe(100);
    expect(formatHalalas(total)).toBe("1.00");
  });
});

describe("parseRiyalParts", () => {
  it("accepts both columns filled", () => {
    expect(parseRiyalParts("1234", "56")).toEqual({
      ok: true,
      halalas: 123_456,
    });
  });

  it("treats empty input as zero — a line may have no price", () => {
    expect(parseRiyalParts("", "")).toEqual({ ok: true, halalas: 0 });
    expect(parseRiyalParts(null, undefined)).toEqual({ ok: true, halalas: 0 });
  });

  it("accepts one column filled and the other blank", () => {
    expect(parseRiyalParts("50", "")).toEqual({ ok: true, halalas: 5_000 });
    expect(parseRiyalParts("", "25")).toEqual({ ok: true, halalas: 25 });
  });

  it("rejects halalas above 99 instead of normalising them", () => {
    // Reading "150 هللة" as 1.50 riyal would be deciding what the operator meant.
    const result = parseRiyalParts("0", "150");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/٠ و ٩٩/);
  });

  it("rejects a decimal in either column", () => {
    expect(parseRiyalParts("10.5", "0").ok).toBe(false);
    expect(parseRiyalParts("0", "5.5").ok).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(parseRiyalParts("-5", "0").ok).toBe(false);
  });

  it("rejects exponent notation", () => {
    // A price column that accepts "1e9" is one that will eventually contain it.
    expect(parseRiyalParts("1e9", "0").ok).toBe(false);
  });

  it("rejects non-numeric text", () => {
    expect(parseRiyalParts("مئة", "0").ok).toBe(false);
  });

  it("rejects an amount beyond the column's range", () => {
    // The DB column is a 32-bit integer; an absurd typo must fail loudly rather
    // than wrap to a negative total.
    const result = parseRiyalParts("99999999999999", "0");

    expect(result.ok).toBe(false);
  });

  it("accepts numeric input as well as strings", () => {
    expect(parseRiyalParts(1234, 56)).toEqual({ ok: true, halalas: 123_456 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseRiyalParts("  1234  ", " 56 ")).toEqual({
      ok: true,
      halalas: 123_456,
    });
  });
});

describe("formatHalalas", () => {
  it("always shows two halala digits", () => {
    expect(formatHalalas(500)).toBe("5.00");
    expect(formatHalalas(505)).toBe("5.05");
    expect(formatHalalas(550)).toBe("5.50");
  });

  it("groups thousands", () => {
    expect(formatHalalas(123_456_789)).toBe("1,234,567.89");
  });

  it("formats zero", () => {
    expect(formatHalalas(0)).toBe("0.00");
  });
});

describe("halalasToRiyals", () => {
  it("converts to the decimal Asset.valuation holds", () => {
    expect(halalasToRiyals(123_456)).toBe(1234.56);
    expect(halalasToRiyals(0)).toBe(0);
  });
});
