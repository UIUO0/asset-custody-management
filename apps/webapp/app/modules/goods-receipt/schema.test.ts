/**
 * Which boxes on مذكرة/محضر الاستلام may be left empty.
 *
 * The list is a policy decision, not an implementation detail, and it is the
 * kind that gets loosened by accident — somebody hits a validation error while
 * testing, makes the field optional, and a signed document starts going out
 * without a supplier on it. So each required field is pinned by name, and so is
 * each *optional* one: over-requiring is the other failure, and it makes the
 * form unfillable for a delivery that genuinely has no inspection record.
 *
 * @see {@link file://./schema.ts}
 */

import { describe, expect, it } from "vitest";
import { GoodsReceiptSchema } from "./schema";

/** A complete, valid نموذج 2 — each test removes exactly one thing from it. */
const validMemo = {
  type: "MEMO",
  fiscalYear: "1447",
  entityName: "جهة حكومية",
  entityNumber: "1",
  warehouseName: "المستودع الرئيسي",
  receiptDate: "2026-08-10",
  supplier: "شركة الحاسبات المتقدمة",
  purchaseOrderNumber: "PO-2026-100",
  vat: { riyals: "150", halalas: "00" },
  lines: [
    {
      name: "لابتوب",
      quantity: "1",
      unitPrice: { riyals: "4500", halalas: "50" },
      tracking: "INDIVIDUAL",
    },
  ],
};

/** The same for نموذج 3 — different order reference, no VAT box. */
const validRecord = {
  ...validMemo,
  type: "RECORD",
  purchaseOrderNumber: undefined,
  purchaseRequestNumber: "PR-2026-9",
  vat: undefined,
};

/** Parses and returns the field paths that failed. */
function failingFields(input: unknown): string[] {
  const result = GoodsReceiptSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("GoodsReceiptSchema — required header fields", () => {
  it("accepts a complete نموذج 2", () => {
    expect(failingFields(validMemo)).toEqual([]);
  });

  it("accepts a complete نموذج 3", () => {
    expect(failingFields(validRecord)).toEqual([]);
  });

  it.each([
    "fiscalYear",
    "entityName",
    "entityNumber",
    "warehouseName",
    "receiptDate",
    "supplier",
  ])("refuses a receipt with no %s", (field) => {
    expect(failingFields({ ...validMemo, [field]: "" })).toContain(field);
  });

  it("names the field in Arabic rather than saying 'Required'", () => {
    // These forms have seventeen boxes. "Required" three times leaves the
    // operator hunting for which one.
    const result = GoodsReceiptSchema.safeParse({ ...validMemo, supplier: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("اسم المورد مطلوب");
    }
  });
});

describe("GoodsReceiptSchema — the order reference", () => {
  it("requires أمر الشراء on نموذج 2", () => {
    // Without it `orderNumberOf` finds nothing: the items enter the register
    // and never appear under any أمر شراء or in المالية's coding queue.
    expect(
      failingFields({ ...validMemo, purchaseOrderNumber: undefined }),
    ).toContain("purchaseOrderNumber");
  });

  it("requires طلب الشراء / التعميد on نموذج 3", () => {
    expect(
      failingFields({ ...validRecord, purchaseRequestNumber: undefined }),
    ).toContain("purchaseRequestNumber");
  });

  it("does not ask each form for the other form's reference", () => {
    // نموذج 2 has no «طلب شراء» box and نموذج 3 has no «أمر شراء» box.
    // Requiring both would make each form unfillable.
    expect(failingFields(validMemo)).not.toContain("purchaseRequestNumber");
    expect(failingFields(validRecord)).not.toContain("purchaseOrderNumber");
  });
});

describe("GoodsReceiptSchema — money", () => {
  it("requires a unit price, and says zero is typable", () => {
    const failed = failingFields({
      ...validMemo,
      lines: [
        { ...validMemo.lines[0], unitPrice: { riyals: "", halalas: "" } },
      ],
    });

    expect(failed.join(" ")).toContain("lines");
  });

  it("accepts an explicit zero price", () => {
    // A transferred or donated item is real — it just has to be typed.
    expect(
      failingFields({
        ...validMemo,
        lines: [
          { ...validMemo.lines[0], unitPrice: { riyals: "0", halalas: "" } },
        ],
      }),
    ).toEqual([]);
  });

  it("still treats a blank هللة box as 00", () => {
    // «4500» with an empty هللة reads as 4500.00 on paper, and must here too.
    const result = GoodsReceiptSchema.safeParse({
      ...validMemo,
      lines: [
        { ...validMemo.lines[0], unitPrice: { riyals: "4500", halalas: "" } },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lines[0].unitPrice).toBe(450_000);
  });

  it("requires VAT on نموذج 2 but not on نموذج 3", () => {
    // An untouched box silently parsed to zero before, which understates a
    // signed total by exactly the tax. نموذج 3's total is VAT-inclusive.
    expect(failingFields({ ...validMemo, vat: undefined })).toContain("vat");
    expect(failingFields(validRecord)).not.toContain("vat");
  });

  it("accepts an explicit zero VAT for an exempt supply", () => {
    expect(
      failingFields({ ...validMemo, vat: { riyals: "0", halalas: "0" } }),
    ).toEqual([]);
  });
});

describe("GoodsReceiptSchema — what stays optional", () => {
  it.each([
    "shippingDocNumber",
    "inspectionRecordNumber",
    "provisionalNoticeNumber",
  ])("does not require %s", (field) => {
    // Genuinely optional on paper: not every delivery has an inspection record
    // or a provisional notice.
    expect(failingFields({ ...validMemo, [field]: undefined })).toEqual([]);
  });

  it("does not require نوع الصنف", () => {
    /*
     * Deliberate, and documented in `classification.ts`: a blank category
     * leaves the line unclassified, which is visible and answerable. Forcing a
     * choice pushes the operator to pick the nearest-looking one and produces a
     * confidently wrong accounting classification.
     */
    expect(
      failingFields({
        ...validMemo,
        lines: [{ ...validMemo.lines[0], itemCategory: undefined }],
      }),
    ).toEqual([]);
  });

  it("does not require a description, unit or notes", () => {
    expect(
      failingFields({
        ...validMemo,
        lines: [
          {
            ...validMemo.lines[0],
            description: undefined,
            unit: undefined,
            notes: undefined,
            itemCode: undefined,
          },
        ],
      }),
    ).toEqual([]);
  });
});
