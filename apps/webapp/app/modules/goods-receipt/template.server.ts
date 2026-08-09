/**
 * Building and reading the intake spreadsheet template.
 *
 * Two halves of one contract: {@link buildTemplateWorkbook} writes a workbook
 * laid out like the authority's paper form, and {@link parseTemplateWorkbook}
 * reads a filled one back into the exact object `GoodsReceiptSchema` validates.
 * Both derive from `template.ts`, so a column cannot exist in one and not the
 * other.
 *
 * ## Reading by label, not by coordinate
 *
 * See the docblock in `template.ts`. The short version: operators edit
 * spreadsheets, and any parser that says "the supplier is in C7" is one
 * inserted row away from writing the fiscal year into the supplier field —
 * silently, because both are text.
 *
 * ## The parser is deliberately forgiving, the validator is not
 *
 * This module's job is to get values out of a spreadsheet: it trims, accepts a
 * date as a date or as text, and takes «منفصل» or `INDIVIDUAL` for the tracking
 * mode. It performs **no** business validation — every parsed receipt goes
 * through `GoodsReceiptSchema` and `createGoodsReceipt` exactly like a
 * hand-typed one. An upload is a way of filling the form, not a way around it.
 *
 * @see {@link file://./template.ts} the shared column description
 * @see {@link file://./schema.ts} what the result is validated against
 */

import type { GoodsReceiptType } from "@prisma/client";
import ExcelJS from "exceljs";
import { CAPITALIZATION_RULES } from "./capitalization";
import { getFormShape } from "./form-shape";
import {
  headerFieldsFor,
  itemColumnsFor,
  ITEM_TABLE_ANCHOR,
  TEMPLATE_SHEET_NAME,
  TRACKING_OPTIONS,
  type TemplateItemColumn,
} from "./template";

/** The authority's blue, as printed on both forms. */
const BRAND = "FF044E8B";
const BRAND_LIGHT = "FFE8EFF6";
/** Distinguishes the two columns the paper form does not have. */
const SYSTEM_COLUMN = "FFFFF4CE";

/** Blank item rows written into the template, pre-styled and validated. */
const BLANK_ROWS = 25;

/** Category options for the dropdown, from the capitalisation table. */
function categoryOptions() {
  return CAPITALIZATION_RULES.map((rule) => ({
    value: rule.category as string,
    label: rule.label,
  }));
}

/** Applies the form's table border to a cell. */
function bordered(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin", color: { argb: BRAND } },
    left: { style: "thin", color: { argb: BRAND } },
    bottom: { style: "thin", color: { argb: BRAND } },
    right: { style: "thin", color: { argb: BRAND } },
  };
}

/** Fills a cell with a solid colour. */
function filled(cell: ExcelJS.Cell, argb: string): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/**
 * Builds the empty template for one form.
 *
 * The sheet is right-to-left and styled like the printed نموذج — the blue
 * bands, the boxed tables — because an operator checks a filled template
 * against the paper in front of them, and a bare grid of English-ish headers
 * makes that check impossible.
 *
 * Dropdowns are attached to the two system columns rather than left as free
 * text: a mistyped category silently produces an unclassified item, and the
 * warehouse would not find out until المالية asked why an asset never reached
 * the coding queue.
 *
 * @param type - Which form to build
 * @returns The workbook as a buffer, ready to stream
 */
export async function buildTemplateWorkbook(
  type: GoodsReceiptType,
): Promise<Buffer> {
  const shape = getFormShape(type);
  const headerFields = headerFieldsFor(type);
  const columns = itemColumnsFor(type, categoryOptions());

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "هيئة تطوير المنطقة الشرقية";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(TEMPLATE_SHEET_NAME, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 0 }],
    pageSetup: { orientation: "landscape", paperSize: 9 },
  });

  // ── العنوان ──
  sheet.mergeCells(1, 1, 1, Math.max(columns.length, 4));
  const title = sheet.getCell(1, 1);
  title.value = `${shape.title} (${shape.formNumber})`;
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  filled(title, BRAND);
  sheet.getRow(1).height = 26;

  const note = sheet.getCell(2, 1);
  note.value =
    "عبّئ الخانات ثم ارفع الملف من صفحة «نموذج استلام جديد». لا تحذف عناوين الخانات — النظام يقرأ بها. رقم التسلسل يولّده النظام.";
  sheet.mergeCells(2, 1, 2, Math.max(columns.length, 4));
  note.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
  note.font = { size: 10, color: { argb: "FF555555" } };
  sheet.getRow(2).height = 28;

  // ── الترويسة: تسمية في العمود الأول وقيمة بجانبها ──
  let row = 4;
  for (const field of headerFields) {
    const labelCell = sheet.getCell(row, 1);
    labelCell.value = field.label;
    labelCell.font = { bold: true };
    labelCell.alignment = { horizontal: "right" };
    filled(labelCell, BRAND_LIGHT);
    bordered(labelCell);

    const valueCell = sheet.getCell(row, 2);
    bordered(valueCell);
    valueCell.alignment = { horizontal: "right" };

    if (field.kind === "date") {
      valueCell.numFmt = "yyyy-mm-dd";
    }

    if (field.hint) {
      const hintCell = sheet.getCell(row, 3);
      hintCell.value = field.hint;
      hintCell.font = { size: 9, color: { argb: "FF888888" } };
      hintCell.alignment = { horizontal: "right" };
    }

    row += 1;
  }

  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 40;

  // ── جدول الأصناف ──
  const tableHeaderRow = row + 1;

  columns.forEach((column, index) => {
    const cell = sheet.getCell(tableHeaderRow, index + 1);
    cell.value = column.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    filled(cell, column.systemColumn ? "FF8A6D1F" : BRAND);
    bordered(cell);
  });

  sheet.getRow(tableHeaderRow).height = 30;

  for (let offset = 0; offset < BLANK_ROWS; offset += 1) {
    const itemRow = tableHeaderRow + 1 + offset;

    columns.forEach((column, index) => {
      const cell = sheet.getCell(itemRow, index + 1);
      bordered(cell);
      cell.alignment = { horizontal: "right" };

      if (column.systemColumn) {
        filled(cell, SYSTEM_COLUMN);
      }

      // Serial numbers are pre-filled: the paper form numbers its rows, and an
      // operator pasting 40 lines should not have to number them by hand.
      if (column.field === "_rowNumber") {
        cell.value = offset + 1;
        cell.alignment = { horizontal: "center" };
      }

      if (column.options) {
        applyDropdown(cell, column);
      }
    });
  }

  // ── دليل الخانات ──
  const guideRow = tableHeaderRow + BLANK_ROWS + 3;
  const guideCell = sheet.getCell(guideRow, 1);
  guideCell.value = "إرشادات التعبئة";
  guideCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  filled(guideCell, BRAND);
  sheet.mergeCells(guideRow, 1, guideRow, Math.max(columns.length, 4));

  const guidance = [
    "الأعمدة الملوّنة «(للنظام)» ليست من النموذج الورقي — يحتاجها النظام لتصنيف الصنف وتتبّعه.",
    "المبالغ في خانتين: الريالات والهللات منفصلتان، تماماً كما في النموذج. الهللات من 0 إلى 99.",
    ...columns
      .filter((column) => column.hint)
      .map((column) => `«${column.label}»: ${column.hint}`),
    ...(shape.hasSeparateVat
      ? []
      : ["هذا النموذج إجماليه شامل الضريبة، فلا خانة ضريبة فيه."]),
    `الحد الأقصى ${BLANK_ROWS} سطراً في هذا القالب — أضف صفوفاً داخل الجدول إن احتجت أكثر.`,
  ];

  guidance.forEach((line, index) => {
    const cell = sheet.getCell(guideRow + 1 + index, 1);
    cell.value = line;
    cell.alignment = { horizontal: "right", wrapText: true };
    cell.font = { size: 10 };
    sheet.mergeCells(
      guideRow + 1 + index,
      1,
      guideRow + 1 + index,
      Math.max(columns.length, 4),
    );
  });

  columns.forEach((column, index) => {
    // Column 1..3 widths are set by the header block above; only widen beyond
    // them so the labelled header cells stay readable.
    const target = sheet.getColumn(index + 1);
    target.width = Math.max(target.width ?? 0, column.width);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Attaches an Excel dropdown to one cell.
 *
 * The list is inlined into the validation formula rather than pointing at a
 * hidden sheet: five short Arabic labels fit well inside Excel's 255-character
 * limit for an inline list, and a hidden sheet is one more thing an operator
 * can delete while "tidying up" the file.
 *
 * `showErrorMessage` without `allowBlank: false` — blank is a legitimate answer
 * for the category (an item fitting none of the five), so the dropdown suggests
 * rather than compels.
 */
function applyDropdown(cell: ExcelJS.Cell, column: TemplateItemColumn): void {
  if (!column.options) return;

  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`"${column.options.map((option) => option.label).join(",")}"`],
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "قيمة غير معروفة",
    error: `اختر إحدى القيم: ${column.options
      .map((option) => option.label)
      .join("، ")}`,
  };
}

/** What a parsed sheet yields — the shape `GoodsReceiptSchema` expects. */
export type ParsedTemplate = {
  header: Record<string, string | undefined>;
  vat?: { riyals?: string; halalas?: string };
  lines: Array<Record<string, unknown>>;
};

/** Reads a cell as trimmed text, or undefined when effectively blank. */
function cellText(cell: ExcelJS.Cell | undefined): string | undefined {
  if (!cell) return undefined;

  const value = cell.value;

  if (value === null || value === undefined) return undefined;

  if (value instanceof Date) {
    // ISO date only — the schema coerces it, and a timestamp would import a
    // receipt dated "yesterday 21:00 UTC" for anyone east of London.
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    // Rich text, formula results and hyperlinks all carry their display value
    // somewhere different; `cell.text` is ExcelJS's normalised form.
    const text = cell.text?.trim();
    return text ? text : undefined;
  }

  const text = String(value).trim();
  return text ? text : undefined;
}

/**
 * Splits a riyal amount typed as one number into the two-box form.
 *
 * The sheet has separate ريال and هـ columns, but people paste `4500.5` into
 * the riyals box. Rather than reject it — which reads as the template being
 * broken — the fractional part is moved into the halalas box, which is exactly
 * what the operator meant. Anything beyond two decimals is left alone so
 * `parseRiyalParts` produces its own message about it.
 */
function splitTypedAmount(
  riyals: string | undefined,
  halalas: string | undefined,
): { riyals?: string; halalas?: string } {
  if (!riyals || halalas) return { riyals, halalas };

  const match = /^(-?\d+)[.,](\d{1,2})$/.exec(riyals);
  if (!match) return { riyals, halalas };

  return { riyals: match[1], halalas: match[2].padEnd(2, "0") };
}

/**
 * Normalises a tracking cell to the enum value.
 *
 * Accepts the Arabic label the dropdown offers and the raw enum value, because
 * a file round-tripped through another system may carry either.
 */
function normalizeTracking(value: string | undefined): string {
  if (!value) return "INDIVIDUAL";

  const matched = TRACKING_OPTIONS.find(
    (option) => option.label === value || option.value === value,
  );

  return matched?.value ?? value;
}

/** Normalises a category cell to the enum value, keeping blank as blank. */
function normalizeCategory(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const matched = categoryOptions().find(
    (option) => option.label === value || option.value === value,
  );

  return matched?.value ?? value;
}

/**
 * Reads a filled template back into form values.
 *
 * Finds the header cells by their labels and the item table by its anchor, so
 * the sheet can be edited freely as long as the labels survive. A sheet with no
 * recognisable item table throws — that is the one structural thing worth
 * failing on, because everything else parses to "empty" and would otherwise
 * produce a receipt with no items and no explanation.
 *
 * @param buffer - The uploaded file
 * @param type - The form the operator said they were uploading
 * @returns Header values and lines, unvalidated
 * @throws {Error} When the workbook has no readable sheet or item table
 */
export async function parseTemplateWorkbook(
  buffer: ArrayBuffer | Buffer,
  type: GoodsReceiptType,
): Promise<ParsedTemplate> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ExcelJS.Buffer);

  // The named sheet when present, otherwise the first one: a file that has been
  // through Google Sheets and back may come out with a translated sheet name.
  const sheet =
    workbook.getWorksheet(TEMPLATE_SHEET_NAME) ?? workbook.worksheets[0];

  if (!sheet) {
    throw new Error("الملف لا يحتوي على أي ورقة عمل.");
  }

  const headerFields = headerFieldsFor(type);
  const columns = itemColumnsFor(type, categoryOptions());

  const header: Record<string, string | undefined> = {};
  let vat: ParsedTemplate["vat"];
  let tableHeaderRow: number | null = null;

  const labels = new Map(headerFields.map((field) => [field.label, field]));

  sheet.eachRow((sheetRow, rowNumber) => {
    const first = cellText(sheetRow.getCell(1));
    if (!first) return;

    // The item table's header row wins over a same-named header label — the
    // anchor «الرقم» is distinctive enough that this never actually collides,
    // but resolving it explicitly beats depending on iteration order.
    if (first === ITEM_TABLE_ANCHOR && tableHeaderRow === null) {
      tableHeaderRow = rowNumber;
      return;
    }

    const field = labels.get(first);
    if (!field) return;

    const value = cellText(sheetRow.getCell(2));

    if (field.field === "vat") {
      vat = splitTypedAmount(value, undefined);
      return;
    }

    header[field.field] = value;
  });

  if (tableHeaderRow === null) {
    throw new Error(
      `تعذّر العثور على جدول الأصناف في الملف. تأكّد من أنك ترفع القالب الصحيح وأن عنوان العمود «${ITEM_TABLE_ANCHOR}» لم يُحذف.`,
    );
  }

  /**
   * Column positions read from the uploaded file's own header row, not assumed
   * from the template. Operators reorder columns, and a positional read would
   * quietly swap the quantity with the unit price.
   */
  const positions = new Map<string, number>();
  const headerCells = sheet.getRow(tableHeaderRow);

  for (let index = 1; index <= headerCells.cellCount; index += 1) {
    const label = cellText(headerCells.getCell(index));
    if (!label) continue;

    const column = columns.find((candidate) => candidate.label === label);
    if (column) positions.set(column.field, index);
  }

  const nameColumn = positions.get("name");

  if (!nameColumn) {
    throw new Error(
      "تعذّر العثور على عمود «اسم الصنف» في جدول الأصناف. لا تُعدّل عناوين الأعمدة.",
    );
  }

  const lines: Array<Record<string, unknown>> = [];

  sheet.eachRow((sheetRow, rowNumber) => {
    if (rowNumber <= (tableHeaderRow as number)) return;

    const nameCell = sheetRow.getCell(nameColumn);

    /**
     * A merged row is never a line.
     *
     * The guidance block below the table is written as full-width merged rows,
     * and a merged cell reports its master's value from *every* column it
     * spans — so reading the name column picked the guidance text up and
     * produced six junk items on every upload. Blank rows alone cannot filter
     * them: the text is not blank, it is just not an item.
     *
     * Merging is the right discriminator rather than "stop at the guidance
     * heading": an operator may merge their own annotation anywhere below the
     * table, and any full-width band means the same thing — not a line.
     */
    if (nameCell.isMerged) return;

    const name = cellText(nameCell);

    // The name is the one field with no blank answer, so it is what decides
    // whether a row is a line at all. Blank rows are skipped rather than ending
    // the scan: the guidance block sits below the table, and a gap between the
    // last line and it is normal.
    if (!name) return;

    const read = (field: string) => {
      const index = positions.get(field);
      return index ? cellText(sheetRow.getCell(index)) : undefined;
    };

    const price = splitTypedAmount(
      read("unitPriceRiyals"),
      read("unitPriceHalalas"),
    );

    lines.push({
      itemCode: read("itemCode"),
      name,
      description: read("description"),
      unit: read("unit"),
      quantity: read("quantity") ?? "1",
      unitPrice: price,
      notes: read("notes"),
      tracking: normalizeTracking(read("tracking")),
      itemCategory: normalizeCategory(read("itemCategory")),
    });
  });

  return { header, vat, lines };
}
