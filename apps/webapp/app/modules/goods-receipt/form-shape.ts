/**
 * What each of the two intake forms collects.
 *
 * The authority uses two paper forms and warehouse staff pick per delivery.
 * They overlap heavily but are not versions of one another, and this module is
 * the single description of how they differ. The Zod schemas, the rendered
 * form, the totals block and the signature boxes all derive from here — so
 * adding a field to a form is one edit, not five.
 *
 * A plain module (no `.server`): the form component reads it to decide which
 * fields to render, and a second hand-maintained copy on the client is exactly
 * how the screen and the validator drift apart.
 *
 * @see {@link file://./schema.ts} the Zod schemas built from this
 * @see {@link file://./../../routes/_layout+/receipts.new.tsx} the form
 */

// Values from `enums.ts`, never from `@prisma/client`: this module renders in
// the browser, where Prisma's enum objects are undefined. See enums.ts.
import type { GoodsReceiptParty, GoodsReceiptType } from "@prisma/client";
import { ReceiptParty, ReceiptType } from "./enums";

/** A document reference on the form: a number, optionally with a date. */
export type ReferenceField = {
  /** Field name for the number input. Matches the Prisma column. */
  numberField: string;
  /**
   * Field name for a free-text name, when the form has a cell for one.
   *
   * نموذج 3's «مستند» is a named document — the paper prints the name, then
   * «رقم:» and «تاريخ:» as separate cells. Without this the name was collected
   * by the form and then never printed.
   */
  nameField?: string;
  /** Field name for the date input, when the form prints a date column. */
  dateField?: string;
  /** Arabic label as printed on the paper form. */
  label: string;
  /** Label for the number sub-column; the forms are not consistent about it. */
  numberLabel: string;
  /**
   * Whether the number is required.
   *
   * True for exactly one reference per form — the order number. `orderNumberOf`
   * reads `purchaseOrderNumber ?? purchaseRequestNumber`, so a receipt without
   * it belongs to no أمر شراء: its items enter the register and never surface
   * for coding. The rest are genuinely optional on paper — not every delivery
   * has an inspection record or a provisional notice.
   *
   * The schema enforces it per type in its `superRefine`; this flag is what
   * makes the form say so before the operator submits.
   */
  required?: boolean;
};

/** Everything that differs between نموذج 2 and نموذج 3. */
export type ReceiptFormShape = {
  type: GoodsReceiptType;
  /** Title as printed at the top of the form. */
  title: string;
  /** "نموذج رقم 2" / "نموذج رقم 3". */
  formNumber: string;
  /** One-line description for the type picker. */
  summary: string;
  /** Label of the header date field — the two forms name it differently. */
  dateLabel: string;
  /** Document references, in printed order. */
  references: ReferenceField[];
  /** Label of the item-code column. */
  itemCodeLabel: string;
  /** Whether the item table has a description field (نموذج 2 only). */
  hasDescription: boolean;
  /**
   * Whether VAT is a separate line in the totals block.
   *
   * نموذج 2 prints قيمة إجمالية / ضريبة / إجمالي المبلغ as three rows; نموذج 3
   * prints one VAT-inclusive figure. This drives both the rendered totals and
   * which arithmetic the service performs.
   */
  hasSeparateVat: boolean;
  /** Label of the grand-total row. */
  totalLabel: string;
  /** The three signatories, in printed order (right to left on the form). */
  parties: Array<{ party: GoodsReceiptParty; label: string }>;
};

/** مذكرة استلام — نموذج رقم 2. */
const MEMO: ReceiptFormShape = {
  type: ReceiptType.MEMO,
  title: "مذكرة استلام",
  formNumber: "نموذج رقم 2",
  summary:
    "للتوريدات المصحوبة بأمر شراء ووثيقة شحن. تفصل ضريبة القيمة المضافة في سطر مستقل.",
  dateLabel: "تاريخ الاستلام",
  references: [
    {
      numberField: "purchaseOrderNumber",
      dateField: "purchaseOrderDate",
      label: "أمر الشراء",
      numberLabel: "الرقم",
      required: true,
    },
    {
      numberField: "shippingDocNumber",
      dateField: "shippingDocDate",
      label: "وثيقة الشحن",
      numberLabel: "الرقم",
    },
    {
      numberField: "inspectionRecordNumber",
      dateField: "inspectionRecordDate",
      label: "المعاينة",
      // The inspection reference is a محضر number, not a plain serial — the
      // paper form labels this column differently for that reason.
      numberLabel: "رقم المحضر",
    },
    {
      numberField: "provisionalNoticeNumber",
      dateField: "provisionalNoticeDate",
      label: "إشعار استلام مؤقت",
      numberLabel: "الرقم",
    },
  ],
  itemCodeLabel: "رقم الصنف التسلسلي",
  hasDescription: true,
  hasSeparateVat: true,
  totalLabel: "اجمالي المبلغ",
  parties: [
    {
      party: ReceiptParty.YARD_CUSTODIAN,
      label: "مأمور عهدة ساحة الاستلام (المسلم)",
    },
    {
      party: ReceiptParty.WAREHOUSE_KEEPER,
      label: "أمين المستودع / مأمور العهدة (المستلم)",
    },
    { party: ReceiptParty.WAREHOUSE_HEAD, label: "رئيس قسم المستودعات" },
  ],
};

/** محضر استلام — نموذج رقم 3. */
const RECORD: ReceiptFormShape = {
  type: ReceiptType.RECORD,
  title: "محضر استلام",
  formNumber: "نموذج رقم 3",
  summary:
    "للتوريدات المستلمة بلجنة فنية. قيمة إجمالية واحدة شاملة ضريبة القيمة المضافة.",
  dateLabel: "التاريخ",
  references: [
    {
      numberField: "purchaseRequestNumber",
      label: "رقم طلب الشراء / التعميد",
      numberLabel: "الرقم",
      required: true,
    },
    {
      numberField: "supportingDocNumber",
      nameField: "supportingDocName",
      dateField: "supportingDocDate",
      label: "مستند",
      numberLabel: "الرقم",
    },
  ],
  itemCodeLabel: "رقم التصنيف التسلسلي",
  hasDescription: false,
  hasSeparateVat: false,
  totalLabel: "القيمة الاجمالية شامل ضريبة القيمة المضافة",
  parties: [
    { party: ReceiptParty.RECEIVER, label: "المستلم" },
    { party: ReceiptParty.TECHNICAL_MEMBER, label: "العضو الفني" },
    { party: ReceiptParty.RESPONSIBLE_HEAD, label: "الرئيس المسؤول" },
  ],
};

/** Both forms, keyed by type. */
export const RECEIPT_FORM_SHAPES: Record<GoodsReceiptType, ReceiptFormShape> = {
  [ReceiptType.MEMO]: MEMO,
  [ReceiptType.RECORD]: RECORD,
};

/** Both forms in picker order. */
export const RECEIPT_FORM_LIST: ReceiptFormShape[] = [MEMO, RECORD];

/**
 * The shape for a given type.
 *
 * @param type - Which form
 * @returns Its shape description
 */
export function getFormShape(type: GoodsReceiptType): ReceiptFormShape {
  return RECEIPT_FORM_SHAPES[type];
}

/**
 * The three parties a form of this type expects.
 *
 * Used to validate a signature request: signing نموذج 2 as `TECHNICAL_MEMBER`
 * is not a missing feature, it is a signature on the wrong document.
 *
 * @param type - Which form
 * @returns Its signatory roles
 */
export function partiesForType(type: GoodsReceiptType): GoodsReceiptParty[] {
  return getFormShape(type).parties.map((entry) => entry.party);
}

/**
 * Arabic label for a signatory role.
 *
 * @param party - The role
 * @returns Its label as printed on the form
 */
export function partyLabel(party: GoodsReceiptParty): string {
  for (const shape of RECEIPT_FORM_LIST) {
    const found = shape.parties.find((entry) => entry.party === party);
    if (found) return found.label;
  }

  // Unreachable while the enum and this table agree — but returning the raw
  // enum name beats rendering "undefined" on a signed document.
  return party;
}
