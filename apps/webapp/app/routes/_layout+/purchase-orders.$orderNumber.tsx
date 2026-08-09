/**
 * `/purchase-orders/:orderNumber` — everything that arrived under one order.
 *
 * The trace the whole feature exists for: from a number written on a paper
 * order to the items now on the shelf, each with the receipt that admitted it,
 * its classification, and its finance code.
 *
 * It is also **المالية's working screen**. Every أصل on the order shows an
 * inline رقم الترميز field; مواد show a dash, because a material is expensed on
 * issue and never coded. Finance does not have to open each item — the coding
 * happens where the order is read.
 *
 * @see {@link file://./../../modules/goods-receipt/purchase-order.server.ts}
 * @see {@link file://./assets.$assetId_.finance.tsx} the (placeholder) asset view
 */

import { CustodyHandoverKind } from "@prisma/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { z } from "zod";
import { Form } from "~/components/custom-form";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { Table, Td, Th, Tr } from "~/components/table";
import { db } from "~/database/db.server";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { openHandover } from "~/modules/custody/handover.server";
import { categoryLabel } from "~/modules/goods-receipt/capitalization";
import { itemClassLabel } from "~/modules/goods-receipt/classification";
import { ItemClassValue, ReceiptState } from "~/modules/goods-receipt/enums";
import {
  getHandoverCandidates,
  getPurchaseOrder,
  listDepartments,
  setAssetFinanceCode,
} from "~/modules/goods-receipt/purchase-order.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError, ShelfError } from "~/utils/error";
import { payload, error, parseData } from "~/utils/http.server";
import { formatHalalas } from "~/utils/money";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { requirePermission } from "~/utils/roles.server";

export const meta = () => [{ title: appendToMetaTitle("أمر شراء") }];

/**
 * Local alias so the comparison below reads at the call site. The value comes
 * from the browser-safe constants module, never from `@prisma/client` — Prisma
 * enum *values* are `undefined` in the browser bundle.
 */
const VOIDED_STATE = ReceiptState.VOIDED;

const CodeSchema = z.object({
  intent: z.literal("code"),
  assetId: z.string().min(1),
  /** رقم الترميز. No format: the scheme belongs to المالية, not to us. */
  financeCode: z.string().trim().max(120),
});

/** تسليم دفعة أمر الشراء لإدارة. */
const HandoverSchema = z.object({
  intent: z.literal("handover"),
  departmentTeamMemberId: z.string().min(1, "اختر الإدارة المستلِمة"),
});

/**
 * Two different actions on one screen, so the intent is parsed first and each
 * branch re-checks its own permission. `code` is المالية's and `handover` is
 * المستودعات' — neither role should inherit the other's button by sharing a
 * single `requirePermission` at the top.
 */
const IntentSchema = z.object({
  intent: z.enum(["code", "handover"]),
});

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.read,
    });

    const orderNumber = params.orderNumber as string;

    const order = await getPurchaseOrder({
      // The param arrives percent-decoded by React Router already.
      orderNumber,
      organizationId,
    });

    // Both feed the batch-handover panel. Fetched for every reader rather than
    // gated on the permission: the panel itself is gated in the component, and
    // a loader that branches on role is one more place for the two checks to
    // disagree.
    const [departments, handoverCandidates] = await Promise.all([
      listDepartments({ organizationId }),
      getHandoverCandidates({ orderNumber, organizationId }),
    ]);

    return payload({ order, departments, handoverCandidates });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request, params }: ActionFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const formData = await request.formData();
    const { intent } = parseData(formData, IntentSchema, {
      shouldBeCaptured: false,
    });

    if (intent === "handover") {
      /**
       * Handing stock out is `asset.custody` — المستودعات', not المالية's. A
       * role that codes an asset does not thereby get to move it.
       */
      const { organizationId } = await requirePermission({
        userId,
        request,
        entity: PermissionEntity.asset,
        action: PermissionAction.custody,
      });

      const { departmentTeamMemberId } = parseData(formData, HandoverSchema, {
        shouldBeCaptured: false,
      });

      const orderNumber = params.orderNumber as string;

      // Re-derived on the server, never taken from the form. A client that
      // posted its own asset list could hand over anything in the workspace
      // under the cover of an order number it is allowed to see.
      const candidates = await getHandoverCandidates({
        orderNumber,
        organizationId,
      });

      if (candidates.length === 0) {
        throw new ShelfError({
          cause: null,
          message:
            "لا توجد أصناف جاهزة للتسليم في هذا الأمر — إمّا أنها ما زالت قيد الاستلام أو سُلّمت فعلاً.",
          additionalData: { orderNumber, organizationId },
          label: "Custody",
          status: 409,
          shouldBeCaptured: false,
        });
      }

      // The department must be a department *in this workspace*. Without this
      // read the id is an unvalidated foreign key straight from the form.
      const department = await db.teamMember.findFirst({
        where: {
          id: departmentTeamMemberId,
          organizationId,
          isDepartment: true,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!department) {
        throw new ShelfError({
          cause: null,
          message: "الإدارة المختارة غير موجودة في مساحة العمل.",
          additionalData: { departmentTeamMemberId, organizationId },
          label: "Custody",
          status: 404,
          shouldBeCaptured: false,
        });
      }

      const handover = await openHandover({
        // Full stock per line: the warehouse is handing the department the
        // whole delivery, so a quantity-tracked line moves all of its units.
        assets: candidates.map((asset) => ({
          id: asset.id,
          quantity: asset.quantity ?? 1,
        })),
        organizationId,
        kind: CustodyHandoverKind.HANDOVER,
        counterpartyTeamMemberId: department.id,
        operatorUserId: userId,
        conditionNotes: `تسليم دفعة أمر الشراء ${orderNumber}`,
      });

      // Straight to the محضر: nothing has moved yet — the second signature is
      // what transfers custody, so leaving the operator on this page would
      // read as "done" when the document is still unsigned.
      return redirect(`/handovers/${handover.id}`);
    }

    /**
     * Coding is `asset.update` — which المالية hold and المخزون do not. It is
     * deliberately not `goodsReceipt.update`: the code lands on the item, not
     * on the document, and a role that may correct a receipt is not thereby
     * the one who assigns accounting codes.
     */
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.update,
    });

    const { assetId, financeCode } = parseData(formData, CodeSchema, {
      shouldBeCaptured: false,
    });

    await setAssetFinanceCode({
      assetId,
      organizationId,
      financeCode,
      userId,
    });

    return payload({ coded: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function PurchaseOrderDetailPage() {
  const { order, departments, handoverCandidates } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { roles } = useUserRoleHelper();

  const errorMessage =
    actionData && "error" in actionData ? actionData.error?.message : null;

  /** Only a role that may edit an asset may put a code on one. */
  const canCode = userHasPermission({
    roles,
    entity: PermissionEntity.asset,
    action: PermissionAction.update,
  });

  /** Handing stock out is المستودعات' — separate from coding. */
  const canHandOver = userHasPermission({
    roles,
    entity: PermissionEntity.asset,
    action: PermissionAction.custody,
  });

  /**
   * Cancelled receipts and their items are excluded from `totalHalalas` by the
   * service, so the counts beside it have to be filtered the same way — a
   * "3 نماذج" beside a total that only covers 2 reads as a bug.
   */
  const liveReceipts = order.receipts.filter(
    (receipt) => receipt.state !== VOIDED_STATE,
  );
  const voidedReceiptCount = order.receipts.length - liveReceipts.length;
  const liveItems = order.items.filter((item) => !item.fromVoidedReceipt);

  const awaiting = order.items.filter(
    (item) =>
      item.itemClass === ItemClassValue.ASSET &&
      !item.financeCode &&
      // Nobody should be assigning accounting numbers against a delivery that
      // was called off.
      !item.fromVoidedReceipt,
  ).length;

  return (
    <div className="relative pb-16">
      <Header title={`أمر شراء ${order.orderNumber}`}>
        {/*
         * Printing is a read, so it carries no permission of its own — anyone
         * who can open this page can print it: المستودعات، المالية، المخزون.
         * Opens in a new tab so the print dialog does not replace the order
         * the operator is working from.
         */}
        <Button
          to={`/purchase-orders/${encodeURIComponent(order.orderNumber)}/print`}
          target="_blank"
          variant="secondary"
        >
          طباعة
        </Button>
      </Header>

      {errorMessage ? (
        <div className="mb-6 rounded border border-error-300 bg-error-50 p-4 text-error-700">
          {errorMessage}
        </div>
      ) : null}

      {/*
        ── تسليم الدفعة لإدارة ──

        Only shown to a role that may move custody, and only while there is
        something left to hand over. Once the order has been handed over the
        panel disappears rather than showing a disabled button: an empty batch
        is not an error state the operator has to reason about, it is the
        normal end of this screen's job.
      */}
      {canHandOver && handoverCandidates.length > 0 ? (
        <section className="mb-8 rounded-lg border border-primary-200 bg-primary-25 p-6">
          <h2 className="mb-1 text-lg font-semibold">تسليم الدفعة لإدارة</h2>
          <p className="mb-4 text-sm text-gray-600">
            {handoverCandidates.length} صنفاً جاهزاً للتسليم في محضر واحد.
            الأصناف قيد الاستلام أو التي سُلّمت فعلاً غير مشمولة.
          </p>

          <Form method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="handover" />

            <div className="min-w-56">
              <label
                htmlFor="departmentTeamMemberId"
                className="mb-1 block text-sm font-medium"
              >
                الإدارة المستلِمة
              </label>
              <select
                id="departmentTeamMemberId"
                name="departmentTeamMemberId"
                required
                defaultValue=""
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  اختر الإدارة
                </option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={navigation.state !== "idle"}>
              {navigation.state !== "idle" ? "جارٍ الفتح…" : "فتح محضر التسليم"}
            </Button>
          </Form>

          <p className="mt-3 text-xs text-gray-500">
            لا تنتقل العهدة إلا بعد توقيع الطرفين على المحضر.
          </p>
        </section>
      ) : null}

      {/* ── ملخّص الأمر ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-sm text-gray-500">المورد</dt>
            <dd className="font-medium">{order.suppliers.join("، ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">نماذج الاستلام</dt>
            <dd className="font-medium">
              {liveReceipts.length}
              {voidedReceiptCount > 0 ? (
                <span className="ms-2 text-xs font-normal text-gray-500">
                  + {voidedReceiptCount} ملغى
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">الأصناف</dt>
            <dd className="font-medium">{liveItems.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">إجمالي الأمر</dt>
            <dd className="font-medium" dir="ltr">
              {formatHalalas(order.totalHalalas)}
            </dd>
          </div>
        </dl>

        {awaiting > 0 ? (
          <div className="mt-4 rounded border border-warning-300 bg-warning-50 p-3 text-sm text-warning-700">
            {awaiting} أصل بانتظار الترميز من المالية.
          </div>
        ) : null}
      </section>

      {/* ── نماذج الاستلام ── */}
      <section className="mb-8">
        <h3 className="mb-3">نماذج الاستلام على هذا الأمر</h3>
        <Table>
          <thead>
            <Tr className="text-start">
              <Th>رقم التسلسل</Th>
              <Th>الحالة</Th>
              <Th>التاريخ</Th>
              <Th>الإجمالي</Th>
            </Tr>
          </thead>
          <tbody>
            {order.receipts.map((receipt) => (
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
                <Td>{receipt.state}</Td>
                <Td>
                  {receipt.receiptDate ? (
                    <DateS date={receipt.receiptDate} />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td dir="ltr" className="text-start">
                  {formatHalalas(receipt.totalHalalas)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>

      {/* ── الأصناف ── */}
      <section>
        <h3 className="mb-3">الأصناف الواردة على هذا الأمر</h3>
        <Table>
          <thead>
            <Tr className="text-start">
              <Th>الصنف</Th>
              <Th>المعرّف المتسلسل</Th>
              <Th>النوع</Th>
              <Th>التصنيف</Th>
              <Th>سعر الوحدة</Th>
              <Th>رقم الترميز</Th>
              <Th>النموذج</Th>
            </Tr>
          </thead>
          <tbody>
            {order.items.map((item) => {
              const isAsset = item.itemClass === ItemClassValue.ASSET;

              return (
                <Tr
                  key={item.id}
                  className={item.fromVoidedReceipt ? "opacity-60" : undefined}
                >
                  <Td>
                    {/*
                     * The item name is the obvious thing to click, so it opens
                     * the asset. `/overview` rather than the finance page: that
                     * one is still a placeholder, and sending anyone — least of
                     * all المالية, who work from this screen — to a "coming
                     * soon" panel from the primary link would be worse than no
                     * link at all.
                     */}
                    <Button
                      variant="link"
                      to={`/assets/${item.id}/overview`}
                      className="font-medium"
                    >
                      {item.title}
                    </Button>
                    {item.fromVoidedReceipt ? (
                      <div className="mt-1">
                        <span className="rounded border border-error-300 bg-error-50 px-2 py-0.5 text-xs text-error-700">
                          من نموذج ملغى — خارج إجمالي الأمر
                        </span>
                      </div>
                    ) : null}
                    {item.quantity ? (
                      <div className="text-xs text-gray-500">
                        كمية {item.quantity}
                      </div>
                    ) : null}
                  </Td>
                  <Td>{item.sequentialId ?? "—"}</Td>
                  <Td>{categoryLabel(item.itemCategory)}</Td>
                  <Td>
                    <span
                      className={`rounded border px-2 py-0.5 text-xs ${
                        isAsset
                          ? "border-primary-300 bg-primary-50 text-primary-700"
                          : "border-gray-300 bg-gray-100 text-gray-700"
                      }`}
                    >
                      {itemClassLabel(item.itemClass)}
                    </span>
                  </Td>
                  <Td dir="ltr" className="text-start">
                    {formatHalalas(item.unitPriceHalalas)}
                  </Td>
                  <Td>
                    {/*
                     * Only أصول are coded. A مادة shows a dash rather than a
                     * disabled input, so the rule reads off the screen instead
                     * of looking like a field somebody forgot to enable.
                     */}
                    {!isAsset ? (
                      <span className="text-gray-400">—</span>
                    ) : canCode ? (
                      <Form method="post" className="flex items-center gap-2">
                        {/*
                         * The screen posts two different operations to one
                         * action, so every form has to say which. Without this
                         * the coding field submits an intent-less body and the
                         * action rejects it.
                         */}
                        <input type="hidden" name="intent" value="code" />
                        <input type="hidden" name="assetId" value={item.id} />
                        <input
                          type="text"
                          name="financeCode"
                          defaultValue={item.financeCode ?? ""}
                          placeholder="رقم الترميز"
                          dir="ltr"
                          className="w-36 rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          disabled={navigation.state !== "idle"}
                        >
                          حفظ
                        </Button>
                      </Form>
                    ) : item.financeCode ? (
                      <span dir="ltr">{item.financeCode}</span>
                    ) : (
                      <span className="rounded border border-warning-300 bg-warning-50 px-2 py-0.5 text-xs text-warning-700">
                        بانتظار الترميز
                      </span>
                    )}
                    {item.financeCode && item.financeCodedAt ? (
                      <div className="mt-1 text-xs text-gray-500">
                        <DateS date={item.financeCodedAt} />
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <Button
                      variant="link"
                      to={`/receipts/${item.receiptId}`}
                      className="text-xs"
                    >
                      {item.receiptReference}
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </section>

      <div className="mt-8">
        <Button variant="secondary" to="/purchase-orders">
          العودة إلى أوامر الشراء
        </Button>
      </div>
    </div>
  );
}
