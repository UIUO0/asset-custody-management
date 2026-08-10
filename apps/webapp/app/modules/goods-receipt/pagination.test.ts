/**
 * عدد الصفحات.
 *
 * The rule is arithmetic, so the tests that matter are the edges and the
 * direction the rounding must fail in: a receipt that lands exactly on a page
 * boundary, an empty draft, and the guarantee that the count is never *lower*
 * than the sheets in someone's hand — a missing page is the failure that gets
 * noticed at signing time.
 *
 * @see {@link file://./pagination.ts}
 */

import { describe, expect, it } from "vitest";
import { ITEM_LINES_PER_PAGE, pageCountFor } from "./pagination";

describe("pageCountFor", () => {
  it("gives an empty draft one page", () => {
    // A receipt with no lines is still one sheet of paper.
    expect(pageCountFor(0)).toBe(1);
  });

  it("keeps a short receipt on one page", () => {
    expect(pageCountFor(1)).toBe(1);
    expect(pageCountFor(ITEM_LINES_PER_PAGE)).toBe(1);
  });

  it("rolls over one line past the boundary", () => {
    // The edge the whole constant exists for.
    expect(pageCountFor(ITEM_LINES_PER_PAGE + 1)).toBe(2);
    expect(pageCountFor(ITEM_LINES_PER_PAGE * 2)).toBe(2);
    expect(pageCountFor(ITEM_LINES_PER_PAGE * 2 + 1)).toBe(3);
  });

  it("never reports fewer pages than the lines need", () => {
    // The direction that matters: over-reporting is a blank half page,
    // under-reporting reads as a page someone lost.
    for (let lines = 1; lines <= 200; lines += 1) {
      expect(pageCountFor(lines) * ITEM_LINES_PER_PAGE).toBeGreaterThanOrEqual(
        lines,
      );
    }
  });

  it("treats nonsense input as one page rather than throwing", () => {
    // It is called while the operator is mid-edit, from a length that is always
    // a number — but a page count is never the right place to crash a form.
    expect(pageCountFor(-5)).toBe(1);
    expect(pageCountFor(Number.NaN)).toBe(1);
  });
});
