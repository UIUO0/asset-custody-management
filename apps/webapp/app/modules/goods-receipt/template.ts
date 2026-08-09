/**
 * The spreadsheet template for each intake form — its shape, in one place.
 *
 * ## Why a template at all
 *
 * A delivery of eighty line items is not typed into a browser form. It arrives
 * as a supplier's list, and the warehouse wants to paste it in. So the system
 * hands out a workbook laid out like the paper نموذج, the operator fills it,
 * and uploads it back.
 *
 * ## The rule that makes it parseable
 *
 * **Cells are located by their Arabic label, never by coordinate.** The parser
 * scans column A for a label from {@link HEADER_FIELDS} and reads the cell
 * beside it; it finds the item table by the row whose first cell is «الرقم».
 * That is what lets an operator insert a row, widen a column, or add their own
 * notes at the bottom without breaking the upload — which they will, because it
 * is a spreadsheet and that is what spreadsheets are for.
 *
 * A coordinate-based parser is the obvious first design and it breaks on the
 * first person who presses Ctrl+Shift+Plus.
 *
 * ## Two columns the paper does not have
 *
 * «نوع الصنف» and «طريقة التتبّع» have no box on نموذج 2 or 3. They are here
 * because the system needs them and the paper form's reader does not: the
 * category decides أصل vs مادة through its capitalisation threshold, and the
 * tracking mode decides whether a line of 500 pens becomes 500 records or one.
 * They are marked as system columns in the sheet so nobody mistakes them for
 * part of the official form.
 *
 * This module is neutral (no `.server`): the picker shows the column list, and
 * `template.server.ts` builds and parses the workbook from the same table.
 *
 * @see {@link file://./template.server.ts} the workbook writer and reader
 * @see {@link file://./form-shape.ts} what each form collects
 * @see {@link file://./schema.ts} what the parsed result is validated against
 */

import type { GoodsReceiptType } from "@prisma/client";
import { getFormShape } from "./form-shape";

/** Sheet name. Fixed, so the parser does not depend on workbook order. */
export const TEMPLATE_SHEET_NAME = "النموذج";

/** Label that marks the first cell of the item table's header row. */
export const ITEM_TABLE_ANCHOR = "الرقم";

/**
 * How a header value is read back out of the sheet.
 *
 * `text` and `number` are self-explanatory. `date` accepts both a real Excel
 * date and text — operators type `1447/02/03` as often as they use the date
 * picker, and rejecting the typed form would make the template feel broken.
 */
export type TemplateFieldKind = "text" | "number" | "date";

/** One labelled cell in the header block. */
export type TemplateHeaderField = {
  /** Key in `GoodsReceiptSchema`. */
  field: string;
  /** The label written in column A — and the key the parser matches on. */
  label: string;
  kind: TemplateFieldKind;
  /** Shown under the header block as filling guidance. */
  hint?: string;
};

/**
 * The header fields for a form, in sheet order.
 *
 * Derived from `form-shape.ts` rather than restated, so a reference added to a
 * form appears in its template without a second edit — the drift this whole
 * module exists to avoid.
 *
 * `رقم التسلسل` is deliberately absent: the system assigns it
 * (`EPDA-RCV-YYYY-NNNN`). A box for it would invite an operator to write one
 * and then find it silently ignored.
 *
 * @param type - Which form
 * @returns Labelled header cells, top to bottom
 */
export function headerFieldsFor(type: GoodsReceiptType): TemplateHeaderField[] {
  const shape = getFormShape(type);

  const fields: TemplateHeaderField[] = [
    { field: "fiscalYear", label: "السنة المالية", kind: "text" },
    { field: "entityName", label: "الجهة", kind: "text" },
    { field: "entityNumber", label: "رقم الجهة", kind: "text" },
    { field: "warehouseName", label: "مستودع", kind: "text" },
    { field: "pageCount", label: "عدد الصفحات", kind: "number" },
    { field: "receiptDate", label: shape.dateLabel, kind: "date" },
    { field: "supplier", label: "المورد", kind: "text" },
  ];

  for (const reference of shape.references) {
    if (reference.nameField) {
      fields.push({
        field: reference.nameField,
        label: `${reference.label} — الاسم`,
        kind: "text",
      });
    }

    fields.push({
      field: reference.numberField,
      label: `${reference.label} — ${reference.numberLabel}`,
      kind: "text",
    });

    if (reference.dateField) {
      fields.push({
        field: reference.dateField,
        label: `${reference.label} — التاريخ`,
        kind: "date",
      });
    }
  }

  // نموذج 3's total is VAT-inclusive and the service forces its VAT to zero,
  // so offering the box would be offering a field that is thrown away.
  if (shape.hasSeparateVat) {
    fields.push({
      field: "vat",
      label: "مجموع ضريبة القيمة المضافة",
      kind: "number",
      hint: "بالريال، مثال: 1500.00 — كما هي في فاتورة المورد لا محسوبة بنسبة",
    });
  }

  return fields;
}

/** One column of the item table. */
export type TemplateItemColumn = {
  /** Key on a line in `ReceiptLineSchema`, or a money sub-part. */
  field: string;
  label: string;
  /** Column width in Excel characters. */
  width: number;
  /**
   * True for the two columns the paper form does not have.
   *
   * Rendered in a different colour with «(للنظام)» in the label, so an
   * operator comparing the sheet against the printed form can see at a glance
   * which boxes are ours and which are the authority's.
   */
  systemColumn?: boolean;
  /** Fixed set of accepted values, used to build the Excel dropdown. */
  options?: Array<{ value: string; label: string }>;
  hint?: string;
};

/**
 * Accepted values for «طريقة التتبّع».
 *
 * Labels rather than raw enum values in the sheet: `INDIVIDUAL` means nothing
 * to a warehouse clerk. The parser accepts either.
 */
export const TRACKING_OPTIONS = [
  { value: "INDIVIDUAL", label: "منفصل" },
  { value: "BULK", label: "بالكمية" },
] as const;

/**
 * The item table's columns for a form, left to right in sheet order.
 *
 * The money columns are split into ريال and هللة exactly as the paper prints
 * them. That is not decoration: it is the same two-box split the browser form
 * uses and the only shape `parseRiyalParts` accepts, so a single combined
 * amount could never enter the system through here either.
 *
 * @param type - Which form
 * @param categoryOptions - The `ItemCategory` values, passed in so this module
 *   stays free of the capitalisation table's imports
 * @returns The columns
 */
export function itemColumnsFor(
  type: GoodsReceiptType,
  categoryOptions: Array<{ value: string; label: string }>,
): TemplateItemColumn[] {
  const shape = getFormShape(type);

  const columns: TemplateItemColumn[] = [
    { field: "_rowNumber", label: ITEM_TABLE_ANCHOR, width: 6 },
    { field: "itemCode", label: shape.itemCodeLabel, width: 18 },
    {
      field: "name",
      label: shape.hasDescription ? "اسم الصنف" : "اسم الصنف",
      width: 34,
    },
  ];

  // نموذج 2 prints «اسم الصنف ووصفه» in one column; the sheet splits them so
  // the description is a field rather than a convention about where to put a
  // dash. نموذج 3 has no description column on paper and none here.
  if (shape.hasDescription) {
    columns.push({ field: "description", label: "الوصف", width: 30 });
  }

  columns.push(
    { field: "unit", label: "الوحدة", width: 10 },
    { field: "quantity", label: "الكمية", width: 8 },
    { field: "unitPriceRiyals", label: "سعر الوحدة — ريال", width: 14 },
    { field: "unitPriceHalalas", label: "سعر الوحدة — هـ", width: 12 },
    {
      field: "itemCategory",
      label: "نوع الصنف (للنظام)",
      width: 20,
      systemColumn: true,
      options: categoryOptions,
      hint: "يحدّد حد الرسملة، ومنه أصل أو مادة. اتركه فارغاً إن لم ينطبق أيّ نوع.",
    },
    {
      field: "tracking",
      label: "طريقة التتبّع (للنظام)",
      width: 18,
      systemColumn: true,
      options: [...TRACKING_OPTIONS],
      hint: "«منفصل» ينشئ سجلاً لكل وحدة، و«بالكمية» سجلاً واحداً يحمل الكمية.",
    },
    { field: "notes", label: "ملاحظات", width: 24 },
  );

  return columns;
}

/**
 * Filename for a downloaded template.
 *
 * Named for the authority's form, not for the system: the operator saves it,
 * mails it to a colleague, and the colleague has to know what it is.
 *
 * @param type - Which form
 * @returns A filename ending in `.xlsx`
 */
export function templateFileName(type: GoodsReceiptType): string {
  const shape = getFormShape(type);
  return `قالب ${shape.title} (${shape.formNumber}).xlsx`;
}
