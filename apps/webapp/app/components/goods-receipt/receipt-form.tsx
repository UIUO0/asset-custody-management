/**
 * The intake form itself — renders whichever of the two documents was chosen.
 *
 * Every field, column and signature box comes from the `ReceiptFormShape`
 * passed in, so نموذج 2 and نموذج 3 are one component rather than two files
 * that drift. Adding a reference to a form is an edit in `form-shape.ts`.
 *
 * ## Totals are shown, not submitted
 *
 * The running total updates as the operator types, but it is **not** posted:
 * the service recomputes it from the lines. The number on screen is a check
 * against the paper in front of them, not the value that gets stored — a
 * financial document's total should not be something a form body can assert.
 *
 * ## RTL
 *
 * Uses logical properties (`ms-`/`me-`/`text-start`) throughout, per the EPDA
 * i18n rules — the form is Arabic-first and must not break when the interface
 * switches to English.
 *
 * @see {@link file://./../../modules/goods-receipt/form-shape.ts} what drives the layout
 * @see {@link file://./../../utils/money.ts} the ريال/هللة arithmetic
 */

import { useMemo, useState } from "react";

import type { GoodsReceiptLineTracking, ItemCategory } from "@prisma/client";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Form } from "~/components/custom-form";
import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
// Browser-safe enum values — see modules/goods-receipt/enums.ts.
import {
  CAPITALIZATION_RULES,
  thresholdFor,
} from "~/modules/goods-receipt/capitalization";
import {
  classifyReceiptLine,
  itemClassLabel,
} from "~/modules/goods-receipt/classification";
import { LineTracking } from "~/modules/goods-receipt/enums";
import type { ReceiptFormShape } from "~/modules/goods-receipt/form-shape";
import { formatHalalas, parseRiyalParts } from "~/utils/money";

/** One row of the item table, as the operator is typing it. */
type DraftLine = {
  /** Stable across re-orders so React keys survive a mid-table delete. */
  key: string;
  itemCode: string;
  name: string;
  description: string;
  unit: string;
  quantity: string;
  unitPriceRiyals: string;
  unitPriceHalalas: string;
  notes: string;
  tracking: GoodsReceiptLineTracking;
  /** نوع الصنف — decides the capitalisation threshold, and so أصل vs مادة. */
  itemCategory: ItemCategory | "";
};

/**
 * A blank row.
 *
 * The key is a parameter rather than always generated here because the first
 * row is rendered on the server too. `crypto.randomUUID()` returns a different
 * value in each environment, and the row's `id`/`htmlFor` pair is derived from
 * it — React reported the resulting hydration mismatch and, in its own words,
 * does not patch attribute mismatches up, so the label could end up pointing at
 * nothing. Rows the operator adds later exist only on the client and are free
 * to use a random key.
 *
 * @param key - Stable identity for this row
 */
function emptyLine(key: string = crypto.randomUUID()): DraftLine {
  return {
    key,
    itemCode: "",
    name: "",
    description: "",
    unit: "",
    quantity: "1",
    unitPriceRiyals: "",
    unitPriceHalalas: "",
    notes: "",
    tracking: LineTracking.INDIVIDUAL,
    itemCategory: "",
  };
}

/**
 * The أصل/مادة outcome for a line as it currently stands.
 *
 * Computed with the very function the server decides by, so the badge on screen
 * and the value stored cannot disagree. An unparseable price counts as zero,
 * which reads as مادة — the per-field error already says the price is wrong,
 * and a badge flickering to "أصل" on a typo would be worse than one that waits.
 */
function previewClass(line: DraftLine) {
  if (!line.itemCategory) return null;

  const price = parseRiyalParts(line.unitPriceRiyals, line.unitPriceHalalas);

  return classifyReceiptLine({
    itemCategory: line.itemCategory,
    unitPrice: price.ok ? price.halalas : 0,
  });
}

/**
 * The receipt form.
 *
 * @param props.shape - Which document to render, from `form-shape.ts`
 */
export function ReceiptForm({ shape }: { shape: ReceiptFormShape }) {
  // Fixed key: this row is server-rendered, so its identity must match.
  const [lines, setLines] = useState<DraftLine[]>([emptyLine("line-1")]);
  const [vatRiyals, setVatRiyals] = useState("");
  const [vatHalalas, setVatHalalas] = useState("");

  /**
   * Live totals.
   *
   * Computed with the same helpers the server uses, so the number on screen and
   * the number stored agree. Lines whose price does not parse contribute zero
   * rather than making the whole total read `NaN` — the per-field error already
   * says what is wrong.
   */
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      const price = parseRiyalParts(
        line.unitPriceRiyals,
        line.unitPriceHalalas,
      );
      const quantity = Number(line.quantity);

      if (!price.ok || !Number.isFinite(quantity) || quantity < 1) return sum;

      return sum + price.halalas * quantity;
    }, 0);

    const vat = shape.hasSeparateVat
      ? (() => {
          const parsed = parseRiyalParts(vatRiyals, vatHalalas);
          return parsed.ok ? parsed.halalas : 0;
        })()
      : 0;

    return { subtotal, vat, total: subtotal + vat };
  }, [lines, vatRiyals, vatHalalas, shape.hasSeparateVat]);

  /** How many `Asset` rows this form will produce, so the count is no surprise. */
  const itemCount = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity < 1) return sum;
        return sum + (line.tracking === LineTracking.INDIVIDUAL ? quantity : 1);
      }, 0),
    [lines],
  );

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  return (
    <Form method="post" className="pb-16">
      <input type="hidden" name="type" value={shape.type} />

      <div className="mb-2 text-sm text-gray-500">{shape.formNumber}</div>
      <h2 className="mb-6">{shape.title}</h2>

      {/* ── ترويسة ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h3 className="mb-4">بيانات النموذج</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="السنة المالية"
            name="fiscalYear"
            inputClassName="w-full"
          />
          <Input label="الجهة" name="entityName" inputClassName="w-full" />
          <Input
            label="رقم الجهة"
            name="entityNumber"
            inputClassName="w-full"
          />
          <Input label="مستودع" name="warehouseName" inputClassName="w-full" />
          <Input
            label="عدد الصفحات"
            name="pageCount"
            type="number"
            min={1}
            inputClassName="w-full"
          />
          <Input
            label={shape.dateLabel}
            name="receiptDate"
            type="date"
            inputClassName="w-full"
          />
        </div>
      </section>

      {/* ── المورد والمراجع ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h3 className="mb-4">المورد والمستندات</h3>
        <div className="mb-4">
          <Input label="المورد" name="supplier" inputClassName="w-full" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {shape.references.map((reference) => (
            <div
              key={reference.numberField}
              className="rounded border border-gray-200 p-4"
            >
              <div className="mb-3 font-medium">{reference.label}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={reference.numberLabel}
                  name={reference.numberField}
                  inputClassName="w-full"
                />
                {/* Not every reference has a date column on paper — نموذج 3's
                    purchase request is a number only. */}
                {reference.dateField ? (
                  <Input
                    label="التاريخ"
                    name={reference.dateField}
                    type="date"
                    inputClassName="w-full"
                  />
                ) : null}
              </div>
            </div>
          ))}

          {/* نموذج 3 names its supporting document; نموذج 2 has no such field. */}
          {shape.type === "RECORD" ? (
            <div className="rounded border border-gray-200 p-4">
              <div className="mb-3 font-medium">اسم المستند</div>
              <Input
                label="مستند"
                name="supportingDocName"
                inputClassName="w-full"
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* ── الأصناف ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3>الأصناف</h3>
          <div className="text-sm text-gray-600">
            سيُنشئ هذا النموذج{" "}
            <strong className="text-gray-900">{itemCount}</strong> سجلاً
          </div>
        </div>

        <div className="space-y-4">
          {lines.map((line, index) => (
            <div key={line.key} className="rounded border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium">الصنف {index + 1}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  // The last row is never removable — a receipt with no items
                  // is rejected server-side anyway, and an empty table gives
                  // the operator nothing to type into.
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((entry) => entry.key !== line.key),
                    )
                  }
                >
                  <Trash2Icon className="size-4" />
                  <span className="ms-1">حذف</span>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label={shape.itemCodeLabel}
                  name={`lines[${index}].itemCode`}
                  value={line.itemCode}
                  onChange={(event) =>
                    updateLine(line.key, { itemCode: event.target.value })
                  }
                  inputClassName="w-full"
                />
                <Input
                  label="اسم الصنف"
                  name={`lines[${index}].name`}
                  required
                  value={line.name}
                  onChange={(event) =>
                    updateLine(line.key, { name: event.target.value })
                  }
                  inputClassName="w-full"
                />
                <Input
                  label="الوحدة"
                  name={`lines[${index}].unit`}
                  placeholder="حبة / علبة / متر"
                  value={line.unit}
                  onChange={(event) =>
                    updateLine(line.key, { unit: event.target.value })
                  }
                  inputClassName="w-full"
                />

                {/* نموذج 2 prints name and description in one column; نموذج 3
                    has no description field at all. */}
                {shape.hasDescription ? (
                  <div className="lg:col-span-3">
                    <Input
                      label="وصف الصنف"
                      name={`lines[${index}].description`}
                      inputType="textarea"
                      rows={2}
                      value={line.description}
                      onChange={(event) =>
                        updateLine(line.key, {
                          description: event.target.value,
                        })
                      }
                      inputClassName="w-full"
                    />
                  </div>
                ) : null}

                <Input
                  label="الكمية"
                  name={`lines[${index}].quantity`}
                  type="number"
                  min={1}
                  required
                  value={line.quantity}
                  onChange={(event) =>
                    updateLine(line.key, { quantity: event.target.value })
                  }
                  inputClassName="w-full"
                />

                {/* Two boxes because the paper form has two columns. */}
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="سعر الوحدة (ريال)"
                    name={`lines[${index}].unitPriceRiyals`}
                    type="number"
                    min={0}
                    value={line.unitPriceRiyals}
                    onChange={(event) =>
                      updateLine(line.key, {
                        unitPriceRiyals: event.target.value,
                      })
                    }
                    inputClassName="w-full"
                  />
                  <Input
                    label="هللة"
                    name={`lines[${index}].unitPriceHalalas`}
                    type="number"
                    min={0}
                    max={99}
                    value={line.unitPriceHalalas}
                    onChange={(event) =>
                      updateLine(line.key, {
                        unitPriceHalalas: event.target.value,
                      })
                    }
                    inputClassName="w-full"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`tracking-${line.key}`}
                    className="mb-1 block font-medium"
                  >
                    طريقة التتبّع
                  </label>
                  <select
                    id={`tracking-${line.key}`}
                    name={`lines[${index}].tracking`}
                    value={line.tracking}
                    onChange={(event) =>
                      updateLine(line.key, {
                        tracking: event.target
                          .value as GoodsReceiptLineTracking,
                      })
                    }
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  >
                    <option value={LineTracking.INDIVIDUAL}>
                      سجل منفصل لكل قطعة
                    </option>
                    <option value={LineTracking.BULK}>سجل واحد بالكمية</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {line.tracking === LineTracking.INDIVIDUAL
                      ? "كل قطعة برمز QR ورقم تسلسلي مستقل — مناسب للأجهزة والمعدّات."
                      : "سجل واحد يحمل الكمية كاملة — مناسب للمواد الاستهلاكية."}
                  </p>
                </div>

                {/*
                 * نوع الصنف decides the capitalisation threshold, and the
                 * threshold decides أصل vs مادة. The outcome is shown live
                 * rather than left as a surprise after saving: the operator is
                 * the one who can tell us the category is wrong, and they can
                 * only do that if they can see what it produced.
                 */}
                <div className="lg:col-span-3">
                  <label
                    htmlFor={`category-${line.key}`}
                    className="mb-1 block font-medium"
                  >
                    نوع الصنف
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      id={`category-${line.key}`}
                      name={`lines[${index}].itemCategory`}
                      value={line.itemCategory}
                      onChange={(event) =>
                        updateLine(line.key, {
                          itemCategory: event.target.value as ItemCategory | "",
                        })
                      }
                      className="min-w-56 rounded border border-gray-300 px-3 py-2"
                    >
                      <option value="">— بلا تصنيف —</option>
                      {CAPITALIZATION_RULES.map((rule) => (
                        <option key={rule.category} value={rule.category}>
                          {rule.label} (حد الرسملة{" "}
                          {rule.thresholdRiyals.toLocaleString("en-US")} ريال)
                        </option>
                      ))}
                    </select>

                    <ClassBadge line={line} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    يُصنَّف الصنف تلقائياً: سعر الوحدة أعلى من حد الرسملة ← أصل،
                    وإلا ← مادة. اتركه بلا تصنيف إن لم ينطبق أيٌّ منها.
                  </p>
                </div>

                <div className="lg:col-span-3">
                  <Input
                    label="ملاحظات"
                    name={`lines[${index}].notes`}
                    value={line.notes}
                    onChange={(event) =>
                      updateLine(line.key, { notes: event.target.value })
                    }
                    inputClassName="w-full"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          <PlusIcon className="size-4" />
          <span className="ms-1">إضافة صنف</span>
        </Button>
      </section>

      {/* ── المجاميع ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h3 className="mb-4">المجاميع</h3>

        <dl className="space-y-2">
          {/* نموذج 2 separates VAT; نموذج 3 prints one inclusive figure. */}
          {shape.hasSeparateVat ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <dt>القيمة الاجمالية</dt>
                <dd className="font-medium" dir="ltr">
                  {formatHalalas(totals.subtotal)}
                </dd>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-3">
                <dt className="font-medium">مجموع ضريبة القيمة المضافة</dt>
                <dd className="grid w-48 grid-cols-2 gap-2">
                  <Input
                    label="ريال"
                    name="vatRiyals"
                    type="number"
                    min={0}
                    value={vatRiyals}
                    onChange={(event) => setVatRiyals(event.target.value)}
                    inputClassName="w-full"
                  />
                  <Input
                    label="هللة"
                    name="vatHalalas"
                    type="number"
                    min={0}
                    max={99}
                    value={vatHalalas}
                    onChange={(event) => setVatHalalas(event.target.value)}
                    inputClassName="w-full"
                  />
                </dd>
              </div>
            </>
          ) : null}

          <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-3 text-lg">
            <dt className="font-semibold">{shape.totalLabel}</dt>
            <dd className="font-semibold" dir="ltr">
              {formatHalalas(totals.total)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-gray-500">
          تُحتسب المجاميع في الخادم من الأسطر عند الحفظ؛ ما يظهر هنا للمراجعة
          مقابل المستند الورقي.
        </p>
      </section>

      {/* ── التواقيع ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <h3 className="mb-2">التواقيع</h3>
        <p className="mb-4 text-sm text-gray-600">
          تُجمع بعد الحفظ. تدخل الأصناف النظام فور الحفظ بحالة «قيد الانتظار»،
          ولا يمكن اعتمادها للتوزيع حتى تكتمل التواقيع الثلاثة.
        </p>
        <ul className="space-y-1 text-sm text-gray-700">
          {shape.parties.map((party) => (
            <li key={party.party}>• {party.label}</li>
          ))}
        </ul>
      </section>

      <div className="flex gap-3">
        <Button type="submit">حفظ النموذج وإدخال الأصناف</Button>
        <Button type="button" variant="secondary" to="/receipts">
          إلغاء
        </Button>
      </div>
    </Form>
  );
}

/**
 * The live أصل/مادة verdict for one line.
 *
 * Also states the threshold it was judged against — an operator who disagrees
 * with the classification needs to know the number, not just the answer.
 *
 * @param props.line - The row as currently typed
 */
function ClassBadge({ line }: { line: DraftLine }) {
  const verdict = previewClass(line);

  if (!verdict) {
    return <span className="text-xs text-gray-500">لن يُصنَّف</span>;
  }

  const threshold = thresholdFor(line.itemCategory || null);
  const isAsset = verdict === "ASSET";

  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs ${
        isAsset
          ? "border-primary-300 bg-primary-50 text-primary-700"
          : "border-gray-300 bg-gray-100 text-gray-700"
      }`}
      title={
        threshold === null
          ? undefined
          : `حد الرسملة ${formatHalalas(threshold)} ريال`
      }
    >
      {itemClassLabel(verdict)}
    </span>
  );
}
