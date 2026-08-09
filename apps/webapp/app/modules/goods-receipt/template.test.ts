/**
 * Template round-trip.
 *
 * The contract worth pinning is that a workbook this system *writes* is a
 * workbook this system can *read*, and that the values survive the trip
 * unchanged. Testing the writer and the reader separately would let both drift
 * in the same direction and still pass.
 *
 * The second group covers what operators actually do to a spreadsheet —
 * inserting rows, reordering columns, typing `4500.5` into a box labelled
 * ريال — because those are the failures that arrive as "the upload doesn't
 * work" with no further detail.
 *
 * @see {@link file://./template.server.ts}
 */

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ReceiptType } from "./enums";
import { GoodsReceiptSchema } from "./schema";
import { ITEM_TABLE_ANCHOR, TEMPLATE_SHEET_NAME } from "./template";
import {
  buildTemplateWorkbook,
  parseTemplateWorkbook,
} from "./template.server";

/** Loads a built template so a test can fill it in like an operator would. */
async function openTemplate(type: "MEMO" | "RECORD") {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await buildTemplateWorkbook(type)) as never);

  const sheet = workbook.getWorksheet(TEMPLATE_SHEET_NAME);
  if (!sheet) throw new Error("القالب بلا ورقة عمل");

  return { workbook, sheet };
}

/** Writes a value into the cell beside a header label. */
function setHeader(sheet: ExcelJS.Worksheet, label: string, value: unknown) {
  let done = false;

  sheet.eachRow((row) => {
    if (done) return;
    if (row.getCell(1).text.trim() === label) {
      row.getCell(2).value = value as ExcelJS.CellValue;
      done = true;
    }
  });

  if (!done) throw new Error(`لا توجد خانة باسم «${label}»`);
}

/** Row number of the item table's header row. */
function tableHeaderRow(sheet: ExcelJS.Worksheet): number {
  let found = 0;

  sheet.eachRow((row, rowNumber) => {
    if (!found && row.getCell(1).text.trim() === ITEM_TABLE_ANCHOR) {
      found = rowNumber;
    }
  });

  if (!found) throw new Error("لا يوجد جدول أصناف");
  return found;
}

/** Column index of a labelled item column. */
function columnOf(sheet: ExcelJS.Worksheet, label: string): number {
  const header = sheet.getRow(tableHeaderRow(sheet));

  for (let index = 1; index <= header.cellCount; index += 1) {
    if (header.getCell(index).text.trim() === label) return index;
  }

  throw new Error(`لا يوجد عمود باسم «${label}»`);
}

/** Fills one item row, by column label. */
function setLine(
  sheet: ExcelJS.Worksheet,
  offset: number,
  values: Record<string, unknown>,
) {
  const row = sheet.getRow(tableHeaderRow(sheet) + 1 + offset);

  for (const [label, value] of Object.entries(values)) {
    row.getCell(columnOf(sheet, label)).value = value as ExcelJS.CellValue;
  }
}

/** Serialises an edited workbook back to a buffer for the parser. */
async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("buildTemplateWorkbook", () => {
  it("gives نموذج 2 a VAT box and نموذج 3 none", async () => {
    // نموذج 3's total is VAT-inclusive and the service forces its VAT to zero,
    // so a box for it would be a field the system throws away.
    const memo = await openTemplate(ReceiptType.MEMO);
    const record = await openTemplate(ReceiptType.RECORD);

    const hasVat = (sheet: ExcelJS.Worksheet) => {
      let found = false;
      sheet.eachRow((row) => {
        if (row.getCell(1).text.includes("ضريبة القيمة المضافة")) found = true;
      });
      return found;
    };

    expect(hasVat(memo.sheet)).toBe(true);
    expect(hasVat(record.sheet)).toBe(false);
  });

  it("gives نموذج 2 a description column and نموذج 3 none", async () => {
    // Matches the paper: نموذج 2 prints «اسم الصنف ووصفه», نموذج 3 «اسم الصنف».
    const memo = await openTemplate(ReceiptType.MEMO);
    const record = await openTemplate(ReceiptType.RECORD);

    expect(() => columnOf(memo.sheet, "الوصف")).not.toThrow();
    expect(() => columnOf(record.sheet, "الوصف")).toThrow();
  });

  it("labels each form's item-code column as that form does", async () => {
    const memo = await openTemplate(ReceiptType.MEMO);
    const record = await openTemplate(ReceiptType.RECORD);

    expect(() => columnOf(memo.sheet, "رقم الصنف التسلسلي")).not.toThrow();
    expect(() => columnOf(record.sheet, "رقم التصنيف التسلسلي")).not.toThrow();
  });

  it("splits the price into ريال and هـ, as the paper form does", async () => {
    // Not cosmetic: two boxes is the only shape `parseRiyalParts` accepts, so a
    // single combined amount cannot enter through the template either.
    const { sheet } = await openTemplate(ReceiptType.MEMO);

    expect(() => columnOf(sheet, "سعر الوحدة — ريال")).not.toThrow();
    expect(() => columnOf(sheet, "سعر الوحدة — هـ")).not.toThrow();
  });
});

describe("parseTemplateWorkbook", () => {
  it("round-trips a filled نموذج 2 into a valid submission", async () => {
    const { workbook, sheet } = await openTemplate(ReceiptType.MEMO);

    setHeader(sheet, "السنة المالية", "1447");
    setHeader(sheet, "الجهة", "هيئة تطوير المنطقة الشرقية");
    setHeader(sheet, "المورد", "شركة الحاسبات المتقدمة");
    setHeader(sheet, "أمر الشراء — الرقم", "PO-2026-900");
    setHeader(sheet, "مجموع ضريبة القيمة المضافة", "1500.00");

    setLine(sheet, 0, {
      "رقم الصنف التسلسلي": "1111",
      "اسم الصنف": "لابتوب Dell Latitude 5450",
      الوصف: "معالج i7",
      الوحدة: "حبة",
      الكمية: 3,
      "سعر الوحدة — ريال": 4500,
      "سعر الوحدة — هـ": 50,
      "نوع الصنف (للنظام)": "أجهزة تقنية",
      "طريقة التتبّع (للنظام)": "منفصل",
    });

    const parsed = await parseTemplateWorkbook(
      await toBuffer(workbook),
      ReceiptType.MEMO,
    );

    expect(parsed.header.fiscalYear).toBe("1447");
    expect(parsed.header.supplier).toBe("شركة الحاسبات المتقدمة");
    expect(parsed.header.purchaseOrderNumber).toBe("PO-2026-900");
    expect(parsed.lines).toHaveLength(1);

    // The whole point: the parsed object goes through the same schema a typed
    // submission does, with no upload-specific validation anywhere.
    const input = GoodsReceiptSchema.parse({
      ...parsed.header,
      type: ReceiptType.MEMO,
      vat: parsed.vat,
      lines: parsed.lines,
    });

    expect(input.vat).toBe(150_000);
    expect(input.lines[0].unitPrice).toBe(450_050);
    expect(input.lines[0].quantity).toBe(3);
    expect(input.lines[0].itemCategory).toBe("IT_EQUIPMENT");
    expect(input.lines[0].tracking).toBe("INDIVIDUAL");
  });

  it("accepts a price typed as one number in the ريال box", async () => {
    // Operators paste `4500.5` rather than filling two boxes. Rejecting that
    // reads as the template being broken, so the fraction moves to the هـ box.
    const { workbook, sheet } = await openTemplate(ReceiptType.MEMO);

    setLine(sheet, 0, {
      "اسم الصنف": "كرسي",
      "سعر الوحدة — ريال": "4500.5",
    });

    const parsed = await parseTemplateWorkbook(
      await toBuffer(workbook),
      ReceiptType.MEMO,
    );

    expect(parsed.lines[0].unitPrice).toEqual({
      riyals: "4500",
      halalas: "50",
    });
  });

  it("survives a row inserted above the item table", async () => {
    // The reason cells are found by label instead of coordinate. An operator
    // adding a note above the table must not shift every field by one.
    const { workbook, sheet } = await openTemplate(ReceiptType.MEMO);

    setHeader(sheet, "المورد", "مورد قبل الإدراج");
    setLine(sheet, 0, { "اسم الصنف": "طابعة" });
    sheet.spliceRows(3, 0, ["ملاحظة أضافها الموظف"]);

    const parsed = await parseTemplateWorkbook(
      await toBuffer(workbook),
      ReceiptType.MEMO,
    );

    expect(parsed.header.supplier).toBe("مورد قبل الإدراج");
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].name).toBe("طابعة");
  });

  it("skips a blank row between two items", async () => {
    // The guidance block sits below the table, so a gap is normal and must not
    // end the scan — the alternative silently drops everything after it.
    const { workbook, sheet } = await openTemplate(ReceiptType.MEMO);

    setLine(sheet, 0, { "اسم الصنف": "الصنف الأول" });
    setLine(sheet, 3, { "اسم الصنف": "الصنف الأخير" });

    const parsed = await parseTemplateWorkbook(
      await toBuffer(workbook),
      ReceiptType.MEMO,
    );

    expect(parsed.lines.map((line) => line.name)).toEqual([
      "الصنف الأول",
      "الصنف الأخير",
    ]);
  });

  it("accepts the raw enum value as well as the Arabic label", async () => {
    // A file round-tripped through another system may carry either.
    const { workbook, sheet } = await openTemplate(ReceiptType.RECORD);

    setLine(sheet, 0, {
      "اسم الصنف": "سيارة",
      "نوع الصنف (للنظام)": "VEHICLES",
      "طريقة التتبّع (للنظام)": "BULK",
    });

    const parsed = await parseTemplateWorkbook(
      await toBuffer(workbook),
      ReceiptType.RECORD,
    );

    expect(parsed.lines[0].itemCategory).toBe("VEHICLES");
    expect(parsed.lines[0].tracking).toBe("BULK");
  });

  it("refuses a workbook with no item table, and says why", async () => {
    // The one structural failure worth throwing on: everything else parses to
    // "empty" and would produce a receipt with no items and no explanation.
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("ورقة أخرى").getCell("A1").value = "لا شيء";

    await expect(
      parseTemplateWorkbook(
        Buffer.from(await workbook.xlsx.writeBuffer()),
        ReceiptType.MEMO,
      ),
    ).rejects.toThrow(/جدول الأصناف/);
  });

  it("reads a date typed as text as well as a real date cell", async () => {
    const typed = await openTemplate(ReceiptType.MEMO);
    setHeader(typed.sheet, "تاريخ الاستلام", "2026-08-01");
    setLine(typed.sheet, 0, { "اسم الصنف": "صنف" });

    const real = await openTemplate(ReceiptType.MEMO);
    setHeader(real.sheet, "تاريخ الاستلام", new Date("2026-08-01T00:00:00Z"));
    setLine(real.sheet, 0, { "اسم الصنف": "صنف" });

    const a = await parseTemplateWorkbook(
      await toBuffer(typed.workbook),
      ReceiptType.MEMO,
    );
    const b = await parseTemplateWorkbook(
      await toBuffer(real.workbook),
      ReceiptType.MEMO,
    );

    expect(a.header.receiptDate).toBe("2026-08-01");
    expect(b.header.receiptDate).toBe("2026-08-01");
  });
});
