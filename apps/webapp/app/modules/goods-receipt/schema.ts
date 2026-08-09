/**
 * Validation for the goods-receipt forms.
 *
 * One schema covers both forms rather than two near-identical ones. The fields
 * that only exist on نموذج 2 are optional here and are *stripped* — not merely
 * ignored — when the type is `RECORD`, so a hand-crafted POST cannot write a
 * shipping-document number onto a محضر that has no such column on paper.
 * That stripping lives in `service.server.ts`, which knows the type.
 *
 * Money arrives as the two columns the operator typed (ريال / هللة) and is
 * combined by `parseRiyalParts`. The schema deliberately does **not** accept a
 * pre-combined amount: the form has two boxes, and letting a client send one
 * number would create a second, unvalidated way in.
 *
 * @see {@link file://./form-shape.ts} which fields belong to which form
 * @see {@link file://./service.server.ts} the consumer
 */

// Values from `enums.ts`: this schema is imported by the form component, so it
// is bundled for the browser where Prisma's enum objects are undefined.
import { z } from "zod";
import { parseRiyalParts } from "~/utils/money";
import { isItemCategory } from "./capitalization";
import { LineTracking, ReceiptType } from "./enums";

/** Trimmed optional text — empty string becomes undefined, not "". */
const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/**
 * Optional date from an `<input type="date">`.
 *
 * An empty box is a legitimate answer on every date field of both forms, so
 * blank maps to undefined rather than failing.
 */
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    value === "" || value === undefined ? undefined : value,
  )
  .pipe(z.coerce.date().optional());

/**
 * The two money columns as typed, validated together.
 *
 * `superRefine` rather than a plain transform so the Arabic message from
 * `parseRiyalParts` reaches the field instead of a generic "invalid".
 */
const riyalParts = z
  .object({
    riyals: z.string().optional(),
    halalas: z.string().optional(),
  })
  .transform((value, ctx) => {
    const parsed = parseRiyalParts(value.riyals, value.halalas);

    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.message });
      return z.NEVER;
    }

    return parsed.halalas;
  });

/** One row of the item table. */
export const ReceiptLineSchema = z.object({
  /** رقم الصنف التسلسلي / رقم التصنيف التسلسلي — the supplier's coding. */
  itemCode: optionalText(120),

  /** اسم الصنف — the one field with no blank answer. */
  name: z.string().trim().min(1, "اسم الصنف مطلوب").max(255),

  /** ووصفه — نموذج 2 only; stripped for نموذج 3 by the service. */
  description: optionalText(1000),

  /** الوحدة */
  unit: optionalText(50),

  /**
   * الكمية — at least one.
   *
   * A zero-quantity line is not a receipt of nothing, it is a mistake: it would
   * produce no items at all while still printing on the document.
   */
  quantity: z.coerce
    .number()
    .int("الكمية يجب أن تكون رقماً صحيحاً")
    .min(1, "الكمية يجب أن تكون ١ على الأقل")
    .max(100_000, "الكمية أكبر من الحد المسموح"),

  /** سعر الوحدة — the two form columns. */
  unitPrice: riyalParts,

  /** ملاحظات */
  notes: optionalText(500),

  /** Whether this line becomes N individual records or one counted row. */
  tracking: z.nativeEnum(LineTracking),

  /**
   * نوع الصنف — the input that decides أصل vs مادة via its capitalisation
   * threshold.
   *
   * Optional: an operator booking in something that fits none of the five
   * categories leaves it blank and the line stays unclassified, which is
   * visible and answerable. Forcing a choice would push them to pick the
   * nearest-looking category and produce a confidently wrong accounting
   * classification.
   */
  itemCategory: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .refine(
      (value) => value === undefined || isItemCategory(value),
      "نوع الصنف غير معروف",
    ),
});

export type ReceiptLineInput = z.infer<typeof ReceiptLineSchema>;

/**
 * Upper bound on lines per receipt.
 *
 * A receipt with an `INDIVIDUAL` line of quantity 100,000 already creates
 * 100,000 assets; multiplying that by an unbounded line count is how a single
 * form submission becomes an outage. The service enforces a separate cap on the
 * total items produced — this one just keeps the request itself sane.
 */
export const MAX_RECEIPT_LINES = 200;

/** The whole form. */
export const GoodsReceiptSchema = z.object({
  type: z.nativeEnum(ReceiptType),

  // ── ترويسة ──
  /** السنة المالية — free text; the authority writes 1447 or 2026. */
  fiscalYear: optionalText(20),
  entityName: optionalText(255),
  entityNumber: optionalText(60),
  warehouseName: optionalText(255),
  pageCount: z.coerce.number().int().min(1).max(999).optional(),
  receiptDate: optionalDate,
  supplier: optionalText(255),

  // ── مراجع نموذج 2 ──
  purchaseOrderNumber: optionalText(120),
  purchaseOrderDate: optionalDate,
  shippingDocNumber: optionalText(120),
  shippingDocDate: optionalDate,
  inspectionRecordNumber: optionalText(120),
  inspectionRecordDate: optionalDate,
  provisionalNoticeNumber: optionalText(120),
  provisionalNoticeDate: optionalDate,

  // ── مراجع نموذج 3 ──
  purchaseRequestNumber: optionalText(120),
  supportingDocName: optionalText(255),
  supportingDocNumber: optionalText(120),
  supportingDocDate: optionalDate,

  /**
   * مجموع ضريبة القيمة المضافة — نموذج 2 only.
   *
   * Taken from the operator rather than computed at a fixed rate: the paper
   * form has a box for it, the supplier's invoice is the source of truth, and
   * exempt or zero-rated lines are real. نموذج 3's total is VAT-inclusive and
   * this is forced to zero for it by the service.
   */
  vat: riyalParts.optional(),

  lines: z
    .array(ReceiptLineSchema)
    .min(1, "أضف صنفاً واحداً على الأقل")
    .max(
      MAX_RECEIPT_LINES,
      `لا يمكن تجاوز ${MAX_RECEIPT_LINES} سطراً في نموذج واحد`,
    ),
});

export type GoodsReceiptInput = z.infer<typeof GoodsReceiptSchema>;

/** Signature submission — the drawn image plus the name as typed. */
export const ReceiptSignatureSchema = z.object({
  party: z.string().min(1),
  /** Name as typed by the signatory; snapshotted onto the record. */
  declaredName: z.string().trim().min(2, "الاسم مطلوب").max(120),
  /**
   * PNG data URL from the signature pad.
   *
   * Bounded because it arrives base64-encoded in a form body: a signature is a
   * few kilobytes of line art, and anything approaching a megabyte is not one.
   */
  signatureImage: z
    .string()
    .min(1, "التوقيع مطلوب")
    .max(1_000_000, "حجم التوقيع كبير جداً")
    .refine(
      (value) => value.startsWith("data:image/png;base64,"),
      "صيغة التوقيع غير صالحة",
    ),
});

export type ReceiptSignatureInput = z.infer<typeof ReceiptSignatureSchema>;
