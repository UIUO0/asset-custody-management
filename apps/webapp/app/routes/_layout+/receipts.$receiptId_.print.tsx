/**
 * `/receipts/:receiptId/print` — the receipt laid out as the paper form.
 *
 * Reachable by anyone with `goodsReceipt.read`: المستودعات who filled it in,
 * المالية who need its prices and supplier, and المخزون who monitor intake.
 * Printing is a read, so it needs no permission of its own.
 *
 * ## Why HTML and not a generated PDF
 *
 * The other PDF surfaces in this app render through headless Chrome, which
 * means a `CHROME_EXECUTABLE_PATH`, a spawned browser per request, and a
 * failure mode that produces a blank file with no explanation. A page the
 * browser prints natively has none of that: it works offline, works on the
 * warehouse's tablet, and "Save as PDF" is already in the print dialog. The
 * layout below is the deliverable — `@media print` does the rest.
 *
 * The filename underscore (`receipts.$receiptId_.print`) opts this route out of
 * the receipt detail layout, so the page prints without the app chrome around
 * it rather than fighting the sidebar with CSS.
 *
 * @see {@link file://./receipts.$receiptId.tsx} the interactive view
 * @see {@link file://./../../modules/goods-receipt/form-shape.ts} the field sets
 */

import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { config } from "~/config/shelf.config";
import { getFormShape } from "~/modules/goods-receipt/form-shape";
import {
  getGoodsReceipt,
  getSignatureUrls,
} from "~/modules/goods-receipt/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import { formatHalalas, toRiyalParts } from "~/utils/money";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.read,
    });

    const receipt = await getGoodsReceipt({
      id: params.receiptId as string,
      organizationId,
    });

    return payload({
      receipt,
      signatureUrls: await getSignatureUrls(receipt.signatures),
      // `logoPath` is optional in the config type; the EPDA build always sets
      // it, and an empty string simply prints without a logo rather than
      // crashing the one page that has to work when someone needs paper.
      logoPath: config.logoPath?.fullLogo ?? "",
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta = () => [{ title: appendToMetaTitle("طباعة نموذج استلام") }];

/**
 * Print stylesheet.
 *
 * Written as a `<style>` text child rather than `dangerouslySetInnerHTML` —
 * react-doctor flags the latter and this is static CSS, so the safe form costs
 * nothing (see CLAUDE.md on silencing those findings).
 */
const PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  @media print {
    /* The trigger button is an on-screen affordance, never part of the paper. */
    .no-print { display: none !important; }
    /* Keep a long item table from splitting a row across two sheets. */
    tr { break-inside: avoid; }
    thead { display: table-header-group; }
  }
  .rcpt { font-size: 12px; color: #000; }
  .rcpt table { width: 100%; border-collapse: collapse; }
  .rcpt th, .rcpt td { border: 1px solid #044E8B; padding: 4px 6px; }
  .rcpt th { background: #044E8B; color: #fff; font-weight: 600; }
  .rcpt .band { background: #044E8B; color: #fff; padding: 6px 10px; font-weight: 700; }
`;

export default function ReceiptPrintPage() {
  const { receipt, signatureUrls, logoPath } = useLoaderData<typeof loader>();
  const shape = getFormShape(receipt.type);

  /**
   * Open the print dialog once the page has painted.
   *
   * `requestAnimationFrame` rather than a bare call: printing before the logo
   * and signature images have laid out produces a first page with gaps where
   * they should be.
   */
  useEffect(() => {
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, []);

  /** A date as printed on the form — plain, no locale surprises on paper. */
  const printDate = (value: string | Date | null) =>
    value ? new Date(value).toLocaleDateString("en-GB") : "";

  return (
    <div
      className="rcpt mx-auto max-w-[210mm] bg-white p-6 text-black"
      dir="rtl"
    >
      <style>{PRINT_CSS}</style>

      <div className="no-print mb-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-primary-600 px-4 py-2 text-white"
        >
          طباعة
        </button>
      </div>

      {/* ── ترويسة الهيئة ── */}
      <div className="mb-3 flex items-start justify-between">
        <div>السنة المالية: {receipt.fiscalYear ?? "—"}</div>
        <img src={logoPath} alt="" className="h-12" />
      </div>

      <div className="band mb-0 flex items-center justify-between">
        <span>{shape.formNumber}</span>
        <span>{shape.title}</span>
      </div>

      {/* ── بيانات النموذج ── */}
      <table className="mb-3">
        <tbody>
          <tr>
            <td>الجهة: {receipt.entityName ?? ""}</td>
            <td>رقم التسلسل: {receipt.reference}</td>
          </tr>
          <tr>
            <td>رقم الجهة: {receipt.entityNumber ?? ""}</td>
            <td>عدد الصفحات: {receipt.pageCount ?? ""}</td>
          </tr>
          <tr>
            <td>مستودع: {receipt.warehouseName ?? ""}</td>
            <td>
              {shape.dateLabel}: {printDate(receipt.receiptDate)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── المورد والمراجع ── */}
      <table className="mb-3">
        <thead>
          <tr>
            <th>المورد</th>
            {shape.references.map((reference) => (
              <th key={reference.numberField}>{reference.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{receipt.supplier ?? ""}</td>
            {shape.references.map((reference) => {
              const number = receipt[
                reference.numberField as keyof typeof receipt
              ] as string | null;
              const date = reference.dateField
                ? (receipt[reference.dateField as keyof typeof receipt] as
                    | string
                    | null)
                : null;

              // نموذج 3's «مستند» prints its name as well as its number and
              // date; نموذج 2's references are numbers only.
              const name = reference.nameField
                ? (receipt[reference.nameField as keyof typeof receipt] as
                    | string
                    | null)
                : null;

              return (
                <td key={reference.numberField}>
                  {name ? `${name} — ` : ""}
                  {number ?? ""}
                  {date ? ` — ${printDate(date)}` : ""}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {/* ── الأصناف ── */}
      <table className="mb-3">
        <thead>
          <tr>
            <th>الرقم</th>
            <th>{shape.itemCodeLabel}</th>
            <th>{shape.hasDescription ? "اسم الصنف ووصفه" : "اسم الصنف"}</th>
            <th>الوحدة</th>
            <th>الكمية</th>
            {/*
             * The paper splits both money columns into ريال and هـ. Printing a
             * single "4,500.50" cell instead is legible but is not the form —
             * and this sheet is filed as the form, so it matches the boxes a
             * clerk expects to read.
             */}
            <th colSpan={2}>سعر الوحدة</th>
            <th colSpan={2}>مجموع القيمة</th>
            <th>ملاحظات</th>
          </tr>
          <tr>
            <th colSpan={5} />
            <th>ريال</th>
            <th>هـ</th>
            <th>ريال</th>
            <th>هـ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.lineNumber}</td>
              <td>{line.itemCode ?? ""}</td>
              <td>
                {line.name}
                {line.description ? ` — ${line.description}` : ""}
              </td>
              <td>{line.unit ?? ""}</td>
              <td>{line.quantity}</td>
              <td dir="ltr">{toRiyalParts(line.unitPriceHalalas).riyals}</td>
              <td dir="ltr">
                {String(toRiyalParts(line.unitPriceHalalas).halalas).padStart(
                  2,
                  "0",
                )}
              </td>
              <td dir="ltr">{toRiyalParts(line.lineTotalHalalas).riyals}</td>
              <td dir="ltr">
                {String(toRiyalParts(line.lineTotalHalalas).halalas).padStart(
                  2,
                  "0",
                )}
              </td>
              <td>{line.notes ?? ""}</td>
            </tr>
          ))}

          {/* Totals sit in the same table so they print attached to the items,
              exactly as the paper form prints them. */}
          {shape.hasSeparateVat ? (
            <>
              <tr>
                <td colSpan={5}>القيمة الاجمالية</td>
                <td colSpan={5} dir="ltr">
                  {formatHalalas(receipt.subtotalHalalas)}
                </td>
              </tr>
              <tr>
                <td colSpan={5}>مجموع ضريبة القيمة المضافة</td>
                <td colSpan={5} dir="ltr">
                  {formatHalalas(receipt.vatHalalas)}
                </td>
              </tr>
            </>
          ) : null}
          <tr>
            <td colSpan={5} style={{ fontWeight: 700 }}>
              {shape.totalLabel}
            </td>
            <td colSpan={5} dir="ltr" style={{ fontWeight: 700 }}>
              {formatHalalas(receipt.totalHalalas)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── التواقيع ── */}
      <table>
        <thead>
          <tr>
            <th />
            {shape.parties.map(({ party, label }) => (
              <th key={party}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>الاسم</td>
            {shape.parties.map(({ party }) => (
              <td key={party}>
                {receipt.signatures.find((s) => s.party === party)
                  ?.declaredName ?? ""}
              </td>
            ))}
          </tr>
          <tr style={{ height: "70px" }}>
            <td>التوقيع</td>
            {shape.parties.map(({ party }) => {
              const url = signatureUrls[party];

              return (
                <td key={party}>
                  {/* An unsigned box prints empty, so the document can still be
                      signed by hand — which is how a محضر gets completed when
                      someone is away from a screen. */}
                  {url ? (
                    <img src={url} alt="" className="mx-auto h-16" />
                  ) : null}
                </td>
              );
            })}
          </tr>
          <tr>
            <td>التاريخ</td>
            {shape.parties.map(({ party }) => (
              <td key={party}>
                {printDate(
                  receipt.signatures.find((s) => s.party === party)?.signedAt ??
                    null,
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
