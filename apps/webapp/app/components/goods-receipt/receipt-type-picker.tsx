/**
 * The choice between the authority's two intake forms.
 *
 * Shown before any data is entered, because the two forms collect different
 * references and different totals — switching afterwards would mean discarding
 * fields the other form has no column for. Asking first is honest about that;
 * a type dropdown inside the form would not be.
 *
 * Both cards describe when the form applies rather than just naming it: an
 * operator holding a delivery note needs to know which document this is, not
 * which enum value it maps to.
 *
 * @see {@link file://./../../modules/goods-receipt/form-shape.ts} the source of both descriptions
 */

import { useRef, useState } from "react";
import { Form } from "~/components/custom-form";
import { RECEIPT_FORM_LIST } from "~/modules/goods-receipt/form-shape";
import { Button } from "../shared/button";

/**
 * The "or upload it" half of a card.
 *
 * A delivery of eighty lines is not typed into a browser form — it arrives as
 * the supplier's list. So each form offers the same two things the paper
 * process does: fill it in here, or take the sheet away, fill it, and hand it
 * back.
 *
 * The template button sits **beside** the file input rather than in a help
 * page: the file the system accepts and the place you hand it in are one
 * decision, and separating them is how someone ends up uploading last year's
 * copy of the sheet.
 *
 * Native `<input type="file">` and a real submit — no drag-drop zone, no
 * progress bar. This runs on warehouse tablets, and the browser's own file
 * picker is the control that works everywhere.
 *
 * @param props.type - Which form this card is for
 * @param props.title - Its Arabic title, for the labels
 */
function UploadRow({ type, title }: { type: string; title: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="mb-2 text-sm font-medium text-gray-700">
        أو ارفع القالب معبّأً
      </div>

      <Form
        method="post"
        encType="multipart/form-data"
        onSubmit={() => setSubmitting(true)}
        className="space-y-2"
      >
        <input type="hidden" name="type" value={type} />

        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(event) =>
            setFileName(event.currentTarget.files?.[0]?.name ?? null)
          }
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            اختيار ملف
          </Button>

          {/*
           * A plain anchor, not a router link: this is a resource route that
           * answers with a file, and letting the client router fetch it would
           * hand the workbook to `.data` instead of the download bar.
           */}
          <a
            href={`/receipts/template/${type}`}
            className="inline-flex items-center rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            تنزيل قالب {title}
          </a>
        </div>

        {fileName ? (
          <div className="truncate text-xs text-gray-600" dir="ltr">
            {fileName}
          </div>
        ) : (
          <div className="text-xs text-gray-500">
            نزّل القالب، عبّئه في Excel، ثم ارفعه من هنا.
          </div>
        )}

        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={!fileName || submitting}
        >
          {submitting ? "جارٍ الرفع…" : "رفع وإنشاء النموذج"}
        </Button>
      </Form>
    </div>
  );
}

/**
 * Renders one card per form.
 *
 * Navigates with `?type=` rather than posting: choosing a form creates nothing,
 * and a bookmarkable URL means an operator who fills half a form, follows a
 * link and comes back lands on the right one.
 */
export function ReceiptTypePicker() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <h2 className="mb-2">اختر نوع النموذج</h2>
      <p className="mb-8 text-gray-600">
        النموذجان يختلفان في المراجع المطلوبة وطريقة احتساب الإجمالي، فاختر ما
        يطابق المستندات التي بين يديك. لا يمكن تغيير النوع بعد بدء التعبئة.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {RECEIPT_FORM_LIST.map((shape) => (
          <div
            key={shape.type}
            className="flex flex-col rounded-lg border border-gray-200 p-6"
          >
            <div className="mb-1 text-sm text-gray-500">{shape.formNumber}</div>
            <h3 className="mb-3">{shape.title}</h3>
            <p className="mb-6 grow text-sm text-gray-600">{shape.summary}</p>

            <dl className="mb-6 space-y-1 text-sm text-gray-500">
              <div className="flex justify-between gap-4">
                <dt>المراجع</dt>
                {/* Concrete counts, so the operator can match the form to the
                    paperwork in front of them rather than guessing. */}
                <dd className="text-gray-700">{shape.references.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>الضريبة</dt>
                <dd className="text-gray-700">
                  {shape.hasSeparateVat ? "سطر مستقل" : "ضمن الإجمالي"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>التواقيع</dt>
                <dd className="text-gray-700">{shape.parties.length}</dd>
              </div>
            </dl>

            <Button to={`/receipts/new?type=${shape.type}`} className="w-full">
              تعبئة {shape.title}
            </Button>

            <UploadRow type={shape.type} title={shape.title} />
          </div>
        ))}
      </div>
    </div>
  );
}
