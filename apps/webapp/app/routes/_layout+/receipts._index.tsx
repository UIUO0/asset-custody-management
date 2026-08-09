/**
 * `/receipts` — every goods receipt booked into this workspace.
 *
 * The operational view of intake: what arrived, from whom, how much of it, and
 * which documents are still waiting on signatures. The signature column is the
 * one that matters day to day — a receipt stuck at «بانتظار التواقيع» is stock
 * that cannot be approved for distribution.
 *
 * @see {@link file://./receipts.new.tsx} filling a new one in
 * @see {@link file://./../../modules/goods-receipt/service.server.ts}
 */

import type { GoodsReceiptState } from "@prisma/client";
// Browser-safe enum values — see modules/goods-receipt/enums.ts.
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { Table, Td, Th, Tr } from "~/components/table";
import { ReceiptState } from "~/modules/goods-receipt/enums";
import { getFormShape } from "~/modules/goods-receipt/form-shape";
import { getGoodsReceipts } from "~/modules/goods-receipt/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error, getCurrentSearchParams } from "~/utils/http.server";
import { formatHalalas } from "~/utils/money";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta = () => [{ title: appendToMetaTitle("نماذج الاستلام") }];

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.read,
    });

    const searchParams = getCurrentSearchParams(request);
    const page = Number(searchParams.get("page")) || 1;

    const { receipts, totalItems, totalPages } = await getGoodsReceipts({
      organizationId,
      page,
      search: searchParams.get("s"),
    });

    return payload({ receipts, totalItems, totalPages, page });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

/** Arabic label and colour for each receipt state. */
const STATE_STYLES: Record<
  GoodsReceiptState,
  { label: string; className: string }
> = {
  [ReceiptState.DRAFT]: {
    label: "مسودة",
    className: "border-gray-300 bg-gray-100 text-gray-700",
  },
  [ReceiptState.SAVED]: {
    label: "بانتظار التواقيع",
    className: "border-warning-300 bg-warning-50 text-warning-700",
  },
  [ReceiptState.SIGNED]: {
    label: "موقّع",
    className: "border-success-300 bg-success-50 text-success-700",
  },
  [ReceiptState.VOIDED]: {
    label: "ملغى",
    className: "border-error-300 bg-error-50 text-error-700",
  },
};

export default function ReceiptsIndexPage() {
  const { t } = useTranslation();
  const { receipts, totalItems } = useLoaderData<typeof loader>();

  return (
    <div className="relative">
      <Header title="نماذج الاستلام">
        <Button to="/receipts/new" icon="plus">
          {t("receipts.newReceipt")}
        </Button>
      </Header>

      {receipts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-12 text-center">
          <h3 className="mb-2">لا توجد نماذج استلام بعد</h3>
          <p className="mb-6 text-gray-600">
            تدخل الأصناف إلى النظام عبر مذكرة استلام أو محضر استلام فقط.
          </p>
          <Button to="/receipts/new">{t("receipts.newReceipt")}</Button>
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm text-gray-600">{totalItems} نموذجاً</div>
          <Table>
            <thead>
              <Tr className="text-start">
                <Th>رقم التسلسل</Th>
                <Th>النوع</Th>
                <Th>المورد</Th>
                <Th>الأصناف</Th>
                <Th>الإجمالي</Th>
                <Th>الحالة</Th>
                <Th>التاريخ</Th>
                <Th />
              </Tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => {
                const state = STATE_STYLES[receipt.state];

                return (
                  <Tr key={receipt.id}>
                    <Td>
                      <Button
                        variant="link"
                        to={`/receipts/${receipt.id}`}
                        className="font-medium"
                      >
                        {receipt.reference}
                      </Button>
                    </Td>
                    <Td>{getFormShape(receipt.type).title}</Td>
                    <Td>{receipt.supplier ?? "—"}</Td>
                    <Td>{receipt._count.lines}</Td>
                    <Td dir="ltr" className="text-start">
                      {formatHalalas(receipt.totalHalalas)}
                    </Td>
                    <Td>
                      <span
                        className={`rounded border px-2 py-0.5 text-xs ${state.className}`}
                      >
                        {state.label}
                      </span>
                      {/* Signature progress is the number an operator chasing
                          approvals actually needs. */}
                      {receipt.state === ReceiptState.SAVED ? (
                        <span className="ms-2 text-xs text-gray-500">
                          {receipt._count.signatures}/3
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <DateS date={receipt.receiptDate ?? receipt.createdAt} />
                    </Td>
                    <Td>
                      {/*
                       * Printing straight from the list: the common errand is
                       * "print me last week's forms", and making it a two-step
                       * trip through each record turned a batch job into
                       * navigation. A read, so it needs no permission of its
                       * own — everyone who sees this list may print from it.
                       */}
                      <Button
                        variant="link"
                        to={`/receipts/${receipt.id}/print`}
                        target="_blank"
                        className="text-xs"
                      >
                        طباعة
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
