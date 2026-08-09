/**
 * Tests for أصل / مادة classification.
 *
 * The boundary is the whole rule, so most of these sit exactly on it: one
 * halala either side of a threshold decides whether an item is capitalised and
 * depreciated for years or written off on issue. An off-by-one here is not a
 * cosmetic bug — it misstates the authority's balance sheet.
 *
 * @see {@link file://./classification.ts}
 * @see {@link file://./capitalization.ts} the thresholds
 */

import { describe, expect, it } from "vitest";
import { toHalalas } from "~/utils/money";
import {
  CAPITALIZATION_RULES,
  ItemCategoryValue,
  thresholdFor,
} from "./capitalization";
import { classifyReceiptLine } from "./classification";

/** A line at the given riyal/halala price in the given category. */
const line = (
  category: keyof typeof ItemCategoryValue | undefined,
  riyals: number,
  halalas = 0,
) => ({
  itemCategory: category ? ItemCategoryValue[category] : undefined,
  unitPrice: toHalalas({ riyals, halalas }),
});

describe("the authority's thresholds", () => {
  it("matches the approved table", () => {
    // Pinned so a change to a threshold has to be a deliberate edit to this
    // test as well as to the registry — these are accounting policy, not
    // configuration someone adjusts in passing.
    expect(
      Object.fromEntries(
        CAPITALIZATION_RULES.map((rule) => [
          rule.category,
          rule.thresholdRiyals,
        ]),
      ),
    ).toEqual({
      FURNITURE: 1_000,
      VEHICLES: 10_000,
      OFFICE_EQUIPMENT: 1_000,
      IT_EQUIPMENT: 1_000,
      OTHER_EQUIPMENT: 1_000,
    });
  });

  it("exposes thresholds in halalas", () => {
    expect(thresholdFor(ItemCategoryValue.VEHICLES)).toBe(1_000_000);
    expect(thresholdFor(ItemCategoryValue.FURNITURE)).toBe(100_000);
  });
});

describe("classifyReceiptLine", () => {
  it("classifies above the threshold as أصل", () => {
    // A 4,500.50 laptop against the 1,000 IT threshold.
    expect(classifyReceiptLine(line("IT_EQUIPMENT", 4_500, 50))).toBe("ASSET");
  });

  it("classifies below the threshold as مادة", () => {
    // 2.75 per box of pens.
    expect(classifyReceiptLine(line("OTHER_EQUIPMENT", 2, 75))).toBe(
      "MATERIAL",
    );
  });

  it("treats an item exactly at the threshold as مادة", () => {
    // «تتعدى حد الرسملة» — at the threshold is not above it. Written with `>=`
    // this rule would capitalise every 1,000-riyal desk.
    expect(classifyReceiptLine(line("FURNITURE", 1_000))).toBe("MATERIAL");
  });

  it("classifies one halala above the threshold as أصل", () => {
    expect(classifyReceiptLine(line("FURNITURE", 1_000, 1))).toBe("ASSET");
  });

  it("applies the vehicle threshold, not the common one", () => {
    // 5,000 is well above 1,000 but far below the 10,000 a vehicle needs — the
    // per-category threshold is the entire point of asking for a category.
    expect(classifyReceiptLine(line("VEHICLES", 5_000))).toBe("MATERIAL");
    expect(classifyReceiptLine(line("VEHICLES", 10_000))).toBe("MATERIAL");
    expect(classifyReceiptLine(line("VEHICLES", 10_000, 1))).toBe("ASSET");
  });

  it("returns null when no category was chosen", () => {
    // Not MATERIAL: defaulting would expense assets silently, and the column
    // would look authoritative while being invented.
    expect(classifyReceiptLine(line(undefined, 50_000))).toBeNull();
  });

  it("classifies a free item as مادة once it has a category", () => {
    expect(classifyReceiptLine(line("OFFICE_EQUIPMENT", 0))).toBe("MATERIAL");
  });

  it("judges the unit price, not the line total", () => {
    // Three laptops at 4,500 are three assets, not one 13,500 asset — and 500
    // pens at 2.75 are 1,375 in total and still مواد. The function only ever
    // sees a unit price, which is what makes that true.
    expect(classifyReceiptLine(line("IT_EQUIPMENT", 4_500))).toBe("ASSET");
    expect(classifyReceiptLine(line("OTHER_EQUIPMENT", 2, 75))).toBe(
      "MATERIAL",
    );
  });

  it("has a rule for every category the schema allows", () => {
    // A category with no threshold would silently classify as null — an item
    // that never reaches المالية's queue.
    for (const category of Object.values(ItemCategoryValue)) {
      expect(thresholdFor(category)).toBeGreaterThan(0);
    }
  });
});
