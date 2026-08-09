/**
 * `/purchase-orders` — الأصناف بأوامر الشراء.
 *
 * Every order number the workspace has received against, with what arrived
 * under it. The column that earns its place is «بانتظار الترميز»: it is the
 * finance queue, and it is the reason this page exists rather than being a
 * filter on the receipts list.
 *
 * @see {@link file://./purchase-orders.$orderNumber.tsx} one order's items
 * @see {@link file://./../../modules/goods-receipt/purchase-order.server.ts}
 */

import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { Table, Td, Th, Tr } from "~/components/table";
import { getPurchaseOrders } from "~/modules/goods-receipt/purchase-order.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error, getCurrentSearchParams } from "~/utils/http.server";
import { formatHalalas } from "~/utils/money";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta = () => [
  { title: appendToMetaTitle("الأصناف بأوامر الشراء") },
];

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    /**
     * Gated on `goodsReceipt.read`, not a permission of its own: an order is a
     * view over receipts, so anyone who may read the receipts may read the
     * grouping — المستودعات، المالية، المخزون.
     */
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.read,
    });

    const orders = await getPurchaseOrders({
      organizationId,
      search: getCurrentSearchParams(request).get("s"),
    });

    return payload({ orders });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export default function PurchaseOrdersIndexPage() {
  const { orders } = useLoaderData<typeof loader>();

  const awaitingTotal = orders.reduce(
    (sum, order) => sum + order.awaitingCodeCount,
    0,
  );

  return (
    <div className="relative">
      <Header title="الأصناف بأوامر الشراء" />

      {orders.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-12 text-center">
          <h3 className="mb-2">لا توجد أوامر شراء بعد</h3>
          <p className="text-gray-600">
            يظهر أمر الشراء هنا فور تسجيل توريدة تحمل رقمه في مذكرة أو محضر
            استلام.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-600">{orders.length} أمر شراء</span>
            {awaitingTotal > 0 ? (
              <span className="rounded border border-warning-300 bg-warning-50 px-2 py-0.5 text-xs text-warning-700">
                {awaitingTotal} أصل بانتظار الترميز
              </span>
            ) : null}
          </div>

          <Table>
            <thead>
              <Tr className="text-start">
                <Th>رقم أمر الشراء</Th>
                <Th>المورد</Th>
                <Th>النماذج</Th>
                <Th>الأصناف</Th>
                <Th>الأصول</Th>
                <Th>بانتظار الترميز</Th>
                <Th>الإجمالي</Th>
                <Th>التاريخ</Th>
                <Th />
              </Tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <Tr key={order.orderNumber}>
                  <Td>
                    <Button
                      variant="link"
                      // Encoded: the number is free text off a paper form and
                      // may carry characters a path segment cannot.
                      to={`/purchase-orders/${encodeURIComponent(
                        order.orderNumber,
                      )}`}
                      className="font-medium"
                    >
                      {order.orderNumber}
                    </Button>
                  </Td>
                  <Td>{order.suppliers.join("، ") || "—"}</Td>
                  <Td>
                    {order.receiptCount}
                    {/*
                     * A cancelled receipt is excluded from every figure on this
                     * row. Saying so beside the count is what keeps the totals
                     * from reading as an arithmetic error to someone holding
                     * the paper documents.
                     */}
                    {order.voidedReceiptCount > 0 ? (
                      <div className="mt-1 text-xs text-gray-500">
                        + {order.voidedReceiptCount} ملغى (خارج الإجمالي)
                      </div>
                    ) : null}
                  </Td>
                  <Td>{order.itemCount}</Td>
                  <Td>{order.assetCount}</Td>
                  <Td>
                    {order.awaitingCodeCount > 0 ? (
                      <span className="rounded border border-warning-300 bg-warning-50 px-2 py-0.5 text-xs text-warning-700">
                        {order.awaitingCodeCount}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td dir="ltr" className="text-start">
                    {formatHalalas(order.totalHalalas)}
                  </Td>
                  <Td>
                    {order.firstReceiptAt ? (
                      <DateS date={order.firstReceiptAt} />
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {/* Same reasoning as the receipts list: printing is a read,
                        and reaching it should not require opening the order. */}
                    <Button
                      variant="link"
                      to={`/purchase-orders/${encodeURIComponent(
                        order.orderNumber,
                      )}/print`}
                      target="_blank"
                      className="text-xs"
                    >
                      طباعة
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
