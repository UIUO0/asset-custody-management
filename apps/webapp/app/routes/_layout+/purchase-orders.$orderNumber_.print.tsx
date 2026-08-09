/**
 * `/purchase-orders/:orderNumber/print` — one order as a paper sheet.
 *
 * Reachable by anyone with `goodsReceipt.read`: المستودعات who received against
 * the order, المالية who code its أصول, and المخزون who monitor intake.
 * Printing is a read, so it carries no permission of its own.
 *
 * ## What this sheet is, and what it is not
 *
 * A مذكرة/محضر استلام is an official form and its printout reproduces the paper
 * exactly. **This is not that.** An order has no government form — it is a view
 * the system derives from the receipts that name one number. So the layout is
 * ours: a summary, the receipts, and the items with their classification and
 * finance codes. It is what المالية take into a coding session and what a
 * warehouse head attaches to a file, not a document anybody signs.
 *
 * Cancelled receipts stay on the sheet and stay marked, for the same reason
 * they stay on screen: dropping a document silently makes the total look like
 * an arithmetic error to whoever is holding the paper.
 *
 * HTML, printed by the browser, rather than a generated PDF — see the receipt
 * print route for that reasoning; it applies unchanged here.
 *
 * @see {@link file://./purchase-orders.$orderNumber.tsx} the interactive view
 * @see {@link file://./receipts.$receiptId_.print.tsx} the official form's printout
 */

import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { config } from "~/config/shelf.config";
import { categoryLabel } from "~/modules/goods-receipt/capitalization";
import { itemClassLabel } from "~/modules/goods-receipt/classification";
import { ReceiptState } from "~/modules/goods-receipt/enums";
import { getPurchaseOrder } from "~/modules/goods-receipt/purchase-order.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import { formatHalalas } from "~/utils/money";
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

    const order = await getPurchaseOrder({
      // The param arrives percent-decoded by React Router already.
      orderNumber: params.orderNumber as string,
      organizationId,
    });

    return payload({
      order,
      // `logoPath` is optional in the config type; the EPDA build always sets
      // it, and an empty string simply prints without a logo rather than
      // crashing the one page that has to work when someone needs paper.
      logoPath: config.logoPath?.fullLogo ?? "",
      printedAt: new Date(),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta = () => [{ title: appendToMetaTitle("طباعة أمر شراء") }];

/**
 * Print stylesheet.
 *
 * Written as a `<style>` text child rather than `dangerouslySetInnerHTML` —
 * react-doctor flags the latter and this is static CSS, so the safe form costs
 * nothing (see CLAUDE.md on silencing those findings).
 *
 * Landscape, unlike the receipt: the item table carries eight columns including
 * the finance code, and portrait squeezes them until the أصل/مادة column is
 * unreadable — which is the column المالية are printing this for.
 */
const PRINT_CSS = `
  @page { size: A4 landscape; margin: 10mm; }
  @media print {
    /* The trigger button is an on-screen affordance, never part of the paper. */
    .no-print { display: none !important; }
    /* Keep a long item table from splitting a row across two sheets. */
    tr { break-inside: avoid; }
    thead { display: table-header-group; }
  }
  .po { font-size: 11px; color: #000; }
  .po table { width: 100%; border-collapse: collapse; }
  .po th, .po td { border: 1px solid #044E8B; padding: 4px 6px; }
  .po th { background: #044E8B; color: #fff; font-weight: 600; }
  .po .band { background: #044E8B; color: #fff; padding: 6px 10px; font-weight: 700; }
  .po .voided { color: #6b7280; }
`;

/** Arabic labels for the receipt states, so the sheet does not print an enum. */
const STATE_LABELS: Record<string, string> = {
  DRAFT: "مسوّدة",
  SAVED: "محفوظ",
  SIGNED: "موقّع",
  VOIDED: "ملغى",
};

export default function PurchaseOrderPrintPage() {
  const { order, logoPath, printedAt } = useLoaderData<typeof loader>();

  /**
   * Open the print dialog once the page has painted.
   *
   * `requestAnimationFrame` rather than a bare call: printing before the logo
   * has laid out produces a first page with a gap where it should be.
   */
  useEffect(() => {
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, []);

  /** A date as printed — plain, no locale surprises on paper. */
  const printDate = (value: string | Date | null) =>
    value ? new Date(value).toLocaleDateString("en-GB") : "";

  const liveReceipts = order.receipts.filter(
    (receipt) => receipt.state !== ReceiptState.VOIDED,
  );
  const voidedReceiptCount = order.receipts.length - liveReceipts.length;
  const liveItems = order.items.filter((item) => !item.fromVoidedReceipt);

  return (
    <div className="po mx-auto max-w-[297mm] bg-white p-6 text-black" dir="rtl">
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
        <div>تاريخ الطباعة: {printDate(printedAt)}</div>
        <img src={logoPath} alt="" className="h-12" />
      </div>

      <div className="band mb-3 flex items-center justify-between">
        <span>أمر شراء</span>
        <span dir="ltr">{order.orderNumber}</span>
      </div>

      {/* ── ملخّص الأمر ── */}
      <table className="mb-3">
        <tbody>
          <tr>
            <td>المورد: {order.suppliers.join("، ") || "—"}</td>
            <td>
              نماذج الاستلام: {liveReceipts.length}
              {voidedReceiptCount > 0 ? ` (+ ${voidedReceiptCount} ملغى)` : ""}
            </td>
          </tr>
          <tr>
            <td>الأصناف: {liveItems.length}</td>
            <td>
              إجمالي الأمر:{" "}
              <span dir="ltr">{formatHalalas(order.totalHalalas)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── نماذج الاستلام ── */}
      <table className="mb-3">
        <thead>
          <tr>
            <th>رقم التسلسل</th>
            <th>الحالة</th>
            <th>التاريخ</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {order.receipts.map((receipt) => {
            const isVoided = receipt.state === ReceiptState.VOIDED;

            return (
              <tr key={receipt.id} className={isVoided ? "voided" : undefined}>
                <td>{receipt.reference}</td>
                <td>{STATE_LABELS[receipt.state] ?? receipt.state}</td>
                <td>{printDate(receipt.receiptDate)}</td>
                <td dir="ltr">
                  {formatHalalas(receipt.totalHalalas)}
                  {/* Spelled out on the row, because the order total below
                      excludes it and a reader comparing the two would
                      otherwise be adding up a difference by hand. */}
                  {isVoided ? " (خارج الإجمالي)" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── الأصناف ── */}
      <table>
        <thead>
          <tr>
            <th>الصنف</th>
            <th>المعرّف المتسلسل</th>
            <th>النوع</th>
            <th>التصنيف</th>
            <th>الكمية</th>
            <th>سعر الوحدة</th>
            <th>رقم الترميز</th>
            <th>النموذج</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr
              key={item.id}
              className={item.fromVoidedReceipt ? "voided" : undefined}
            >
              <td>
                {item.title}
                {item.fromVoidedReceipt ? " (من نموذج ملغى)" : ""}
              </td>
              <td>{item.sequentialId ?? ""}</td>
              <td>{categoryLabel(item.itemCategory)}</td>
              <td>{itemClassLabel(item.itemClass)}</td>
              <td>{item.quantity ?? ""}</td>
              <td dir="ltr">{formatHalalas(item.unitPriceHalalas)}</td>
              <td dir="ltr">{item.financeCode ?? ""}</td>
              <td>{item.receiptReference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
