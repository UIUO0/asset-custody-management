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
 * Required trimmed text.
 *
 * The message is the field's own, in Arabic: a form that says "Required" three
 * times leaves the operator hunting for which box, and these forms have
 * seventeen of them.
 *
 * `required_error` as well as `min(1)`: a box left blank in the browser arrives
 * as `""`, but a blank **cell in an uploaded template** arrives as `undefined`,
 * and only `required_error` covers that one. Without it the upload path fell
 * back to Zod's English "Required".
 */
const requiredText = (message: string, max = 255) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .min(1, message)
    .max(max);

/**
 * Optional date from an `<input type="date">`.
 *
 * An empty box is a legitimate answer on every *reference* date of both forms
 * (not every delivery has an inspection record), so blank maps to undefined
 * rather than failing. The receipt's own date is required — see below.
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
 * Required date.
 *
 * `z.coerce.date()` turns an empty string into `Invalid Date` rather than
 * failing, so the blank is caught before coercion — otherwise the operator gets
 * "Invalid date" for a box they simply did not fill.
 */
const requiredDate = (message: string) =>
  z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .min(1, message)
    .pipe(z.coerce.date({ invalid_type_error: "تاريخ غير صالح" }));

/**
 * The two money columns, when leaving both blank means "not answered".
 *
 * `parseRiyalParts` maps a blank column to zero, which would make an untouched
 * VAT box indistinguishable from a deliberate ٠. That distinction is the whole point
 * here: the `superRefine` below has to be able to tell نموذج 2's operator that
 * they skipped the box, and it cannot do that if skipping it already produced a
 * valid number.
 */
const optionalRiyalParts = z
  .object({
    riyals: z.string().optional(),
    halalas: z.string().optional(),
  })
  .optional()
  .transform((value, ctx) => {
    const untouched =
      !value || (!value.riyals?.trim() && !value.halalas?.trim());

    if (untouched) return undefined;

    const parsed = parseRiyalParts(value.riyals, value.halalas);

    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.message });
      return z.NEVER;
    }

    return parsed.halalas;
  });

/**
 * The two money columns, with the ريال box required.
 *
 * Empty parses to zero (`parseRiyalParts` treats a blank column as 0), which is
 * right for the هللة box — «4500» and a blank هللة means 4500.00, exactly as it
 * reads on paper. It is wrong for the whole amount: a line whose price was
 * simply not typed becomes a 0.00 صنف, which is silently reclassified مادة
 * (every threshold is above zero) and understates the order total on a document
 * somebody signs.
 *
 * Zero stays *typable* — a transferred or donated item is real. It just has to
 * be typed.
 */
const requiredRiyalParts = z
  .object({
    riyals: z.string().optional(),
    halalas: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.riyals?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "سعر الوحدة مطلوب — اكتب ٠ إن كان الصنف بلا قيمة",
      });
      return;
    }

    const parsed = parseRiyalParts(value.riyals, value.halalas);

    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.message });
    }
  })
  .transform((value) => {
    const parsed = parseRiyalParts(value.riyals, value.halalas);
    // Unreachable once superRefine has passed; the fallback keeps the type
    // honest rather than asserting.
    return parsed.ok ? parsed.halalas : 0;
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

  /** سعر الوحدة — the two form columns. Required; see `requiredRiyalParts`. */
  unitPrice: requiredRiyalParts,

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
export const GoodsReceiptSchema = z
  .object({
    type: z.nativeEnum(ReceiptType),

    // ── ترويسة ──
    /** السنة المالية — free text; the authority writes 1447 or 2026. */
    fiscalYear: requiredText("السنة المالية مطلوبة", 20),
    entityName: requiredText("الجهة مطلوبة"),
    entityNumber: requiredText("رقم الجهة مطلوب", 60),
    warehouseName: requiredText("اسم المستودع مطلوب"),
    /**
     * `pageCount` is **not** here on purpose.
     *
     * The system derives it from the item lines (`pagination.ts`) and the service
     * writes it. Accepting it would leave a second, unvalidated way to set a
     * number that gets printed on a signed document — the same reason
     * `itemClass` is absent from `ReceiptLineSchema`.
     */
    receiptDate: requiredDate("تاريخ الاستلام مطلوب"),
    supplier: requiredText("اسم المورد مطلوب"),

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
    vat: optionalRiyalParts,

    lines: z
      .array(ReceiptLineSchema)
      .min(1, "أضف صنفاً واحداً على الأقل")
      .max(
        MAX_RECEIPT_LINES,
        `لا يمكن تجاوز ${MAX_RECEIPT_LINES} سطراً في نموذج واحد`,
      ),
  })
  /**
   * The order reference each form carries — required, and required *per type*.
   *
   * This is the field the whole purchase-order feature hangs on: `orderNumberOf`
   * reads `purchaseOrderNumber ?? purchaseRequestNumber`, and a receipt with
   * neither belongs to no order at all. Its items enter the register, never
   * appear under any أمر شراء, and never reach المالية's coding queue — a
   * delivery lost in plain sight, with nothing on screen to say so.
   *
   * A `superRefine` rather than making both fields required, because each form
   * has only one of them: نموذج 2 prints «أمر الشراء» and نموذج 3 prints «رقم
   * طلب الشراء / التعميد». Requiring both would make each form unfillable.
   *
   * The issue is attached to the field itself (`path`), so the error lands on
   * the box the operator has to fix rather than at the top of the form.
   */
  .superRefine((input, ctx) => {
    if (input.type === ReceiptType.MEMO && !input.purchaseOrderNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purchaseOrderNumber"],
        message: "رقم أمر الشراء مطلوب — به تُتابَع الأصناف في أمرها",
      });
    }

    if (input.type === ReceiptType.RECORD && !input.purchaseRequestNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["purchaseRequestNumber"],
        message:
          "رقم طلب الشراء أو التعميد مطلوب — به تُتابَع الأصناف في أمرها",
      });
    }

    /**
     * نموذج 2 prints ضريبة القيمة المضافة as its own totals row, so it has to
     * be answered — with ٠ when the supply is exempt or zero-rated, which is
     * real. An empty box currently parses to zero *silently*, and a forgotten
     * VAT understates the total on a signed document by exactly the tax.
     *
     * نموذج 3's total is VAT-inclusive and the service forces its VAT to zero,
     * so asking for it there would be asking for a number that is discarded.
     */
    if (input.type === ReceiptType.MEMO && input.vat === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vat"],
        message: "مجموع الضريبة مطلوب — اكتب ٠ إن كانت التوريدة معفاة",
      });
    }
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
