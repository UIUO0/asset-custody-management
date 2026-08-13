/**
 * `/receipts/:receiptId` — one goods receipt, and where it gets signed.
 *
 * Shows the document as filled in, the items each line produced, and the three
 * signature boxes. Signing here is what unblocks approving those items for
 * distribution — see `receipt-gate.server.ts`.
 *
 * @see {@link file://./../../modules/goods-receipt/service.server.ts}
 */

import type { ReactNode } from "react";
import type { GoodsReceiptParty } from "@prisma/client";
// Browser-safe enum values — see modules/goods-receipt/enums.ts.
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { Form } from "~/components/custom-form";
import { SignatureBoxes } from "~/components/goods-receipt/signature-boxes";
import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { Table, Td, Th, Tr } from "~/components/table";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { categoryLabel } from "~/modules/goods-receipt/capitalization";
import { itemClassLabel } from "~/modules/goods-receipt/classification";
import { ReceiptState } from "~/modules/goods-receipt/enums";
import { getFormShape } from "~/modules/goods-receipt/form-shape";
import { ReceiptSignatureSchema } from "~/modules/goods-receipt/schema";
import {
  getGoodsReceipt,
  getSignatureUrls,
  materializeReceiptItems,
  storeReceiptSignature,
  deleteGoodsReceipt,
  voidGoodsReceipt,
} from "~/modules/goods-receipt/service.server";
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

export const meta = () => [{ title: appendToMetaTitle("نموذج استلام") }];

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

    // Signature images live in a private bucket; these URLs expire in minutes.
    // The paths come along with the receipt, so no second query is needed.
    const signatureUrls = await getSignatureUrls(receipt.signatures);

    /**
     * `Header` renders **nothing at all** without this key — it returns `null`
     * when the loader has no `header`, taking every button inside it with it.
     * This page had a print and a cancel button that nobody could see.
     */
    const header: HeaderData = { title: receipt.reference };

    return payload({ header, receipt, signatureUrls });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request, params }: ActionFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const formData = await request.formData();

    /**
     * Three intents with different permissions, so the gate is chosen before it
     * is applied rather than after. Voiding is `delete` — held by المستودعات
     * and (provisionally) المخزون; signing and repairing are `update`. A role
     * that may look at a receipt is not thereby allowed to sign or cancel it.
     */
    /**
     * Erase. `goodsReceipt.delete` opens the door; how far it opens is decided
     * by `asset.delete`, checked below.
     *
     * Erasing takes the items with it, so the authority to erase a document
     * people have already signed is the authority to destroy items in
     * circulation — which is what `asset.delete` names. المستودعات hold only
     * the first, and can therefore undo their own data entry up until someone
     * signs it; المخزون hold both. Deriving it from the permission map rather
     * than naming the roles keeps the rule in one place.
     */
    if (formData.get("intent") === "erase") {
      const { organizationId, roles } = await requirePermission({
        userId,
        request,
        entity: PermissionEntity.goodsReceipt,
        action: PermissionAction.delete,
      });

      await deleteGoodsReceipt({
        id: params.receiptId as string,
        organizationId,
        canDeleteSigned: userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.delete,
        }),
      });

      // Nothing left to show — the record this page renders is gone.
      return redirect("/receipts");
    }

    if (formData.get("intent") === "void") {
      const { organizationId } = await requirePermission({
        userId,
        request,
        entity: PermissionEntity.goodsReceipt,
        action: PermissionAction.delete,
      });

      await voidGoodsReceipt({
        id: params.receiptId as string,
        organizationId,
      });

      return payload({ voided: true });
    }

    /**
     * Repair. `update`, not `delete`: it adds the records the receipt already
     * says arrived — it changes nothing about the document itself, and cannot
     * duplicate anything, because lines that already produced items are skipped.
     */
    if (formData.get("intent") === "materialize") {
      const { organizationId } = await requirePermission({
        userId,
        request,
        entity: PermissionEntity.goodsReceipt,
        action: PermissionAction.update,
      });

      const created = await materializeReceiptItems({
        receiptId: params.receiptId as string,
        organizationId,
        userId,
      });

      return payload({ materialized: created });
    }

    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.update,
    });

    const { party, declaredName, signatureImage } = parseData(
      formData,
      ReceiptSignatureSchema,
      { shouldBeCaptured: false },
    );

    const receipt = await getGoodsReceipt({
      id: params.receiptId as string,
      organizationId,
    });

    if (receipt.state === ReceiptState.VOIDED) {
      throw new ShelfError({
        cause: null,
        message: "لا يمكن التوقيع على نموذج ملغى.",
        label: "Assets",
        status: 400,
        shouldBeCaptured: false,
      });
    }

    await storeReceiptSignature({
      receiptId: receipt.id,
      organizationId,
      party: party as GoodsReceiptParty,
      declaredName,
      signatureDataUrl: signatureImage,
      userId,
      // Captured for evidentiary value; absent behind some proxies, which must
      // not block a signature.
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    return payload({ signed: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function ReceiptDetailPage() {
  const { receipt, signatureUrls } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const shape = getFormShape(receipt.type);
  const { roles } = useUserRoleHelper();

  const errorMessage =
    actionData && "error" in actionData ? actionData.error?.message : null;

  const totalItems = receipt.lines.reduce(
    (sum, line) => sum + line._count.assets,
    0,
  );

  /**
   * Records the receipt *should* have produced: one per unit for a line tracked
   * individually, one for the whole quantity when tracked in bulk.
   *
   * Items are created after the receipt transaction commits, so a failure
   * partway leaves a saved receipt holding fewer records than lines. That is
   * repaired the next time the receipt is signed, but it has to be visible
   * before then — otherwise a document reads as complete while the stock it
   * admitted was never entered.
   */
  const expectedItems = receipt.lines.reduce(
    (sum, line) => sum + (line.tracking === "BULK" ? 1 : line.quantity),
    0,
  );
  const missingItems = Math.max(expectedItems - totalItems, 0);

  /**
   * Voiding is offered to whoever holds `goodsReceipt.delete` — المستودعات and,
   * provisionally, المخزون. Asking the permission map rather than naming roles
   * keeps this button honest if the map changes; the action re-checks anyway,
   * so this only decides whether the button is worth rendering.
   */
  const canVoid =
    userHasPermission({
      roles,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.delete,
    }) && receipt.state !== ReceiptState.VOIDED;

  /**
   * Erasing needs the same permission as cancelling, and unlike it applies in
   * every state — a cancelled receipt is exactly the one somebody is most
   * likely to want gone.
   */
  /**
   * Erasing is offered only where the action would actually go through — the
   * same two-part rule the action applies, so nobody is shown a button that
   * answers 403. `asset.delete` is what permits erasing a signed document; see
   * the action for why that is the permission that decides it.
   */
  const canErase =
    userHasPermission({
      roles,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.delete,
    }) &&
    (receipt.state !== ReceiptState.SIGNED ||
      userHasPermission({
        roles,
        entity: PermissionEntity.asset,
        action: PermissionAction.delete,
      }));

  /**
   * Repair is offered to whoever may edit a receipt — المستودعات. Signing
   * repairs a receipt on its way to SIGNED, but a receipt that was *already*
   * signed when it came up short has no other way back, so the button is the
   * only exit from that state.
   */
  const canRepair = userHasPermission({
    roles,
    entity: PermissionEntity.goodsReceipt,
    action: PermissionAction.update,
  });

  return (
    <div className="relative pb-16">
      <Header title={receipt.reference}>
        {/*
         * Printing is a read, so it carries no permission of its own — anyone
         * who can open this page can print it: المستودعات، المالية، المخزون.
         * Opens in a new tab so the print dialog does not replace the record
         * the operator is working from.
         */}
        <Button
          to={`/receipts/${receipt.id}/print`}
          target="_blank"
          variant="secondary"
        >
          طباعة
        </Button>

        {canVoid ? (
          <Form
            method="post"
            onSubmit={(event) => {
              // Voiding cannot be undone from the UI, and it is one click away
              // from a signature pad — worth a confirm.
              if (
                !window.confirm(
                  "إلغاء هذا النموذج؟ يبقى المستند في السجل، والأصناف التي أنشأها لا تُحذف.",
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="void" />
            <Button type="submit" variant="secondary">
              إلغاء النموذج
            </Button>
          </Form>
        ) : null}

        {/*
         * Erase sits beside cancel, not instead of it: they answer different
         * questions. Cancel is "this delivery was called off" — the document
         * stays because it happened. Erase is "this document should never have
         * existed", and it takes the items with it.
         *
         * `variant="danger"` and a confirm that names the item count: this is
         * the only control on the screen with no way back.
         */}
        {canErase ? (
          <Form
            method="post"
            onSubmit={(event) => {
              if (
                !window.confirm(
                  `حذف ${receipt.reference} نهائياً؟ سيُمحى المستند وتواقيعه و${totalItems} صنفاً أنشأها. لا يمكن التراجع.`,
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="erase" />
            <Button type="submit" variant="danger">
              حذف نهائي
            </Button>
          </Form>
        ) : null}
      </Header>

      {errorMessage ? (
        <div className="mb-6 rounded border border-error-300 bg-error-50 p-4 text-error-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mb-2 text-sm text-gray-500">{shape.formNumber}</div>
      <h2 className="mb-6">{shape.title}</h2>

      {/* ── ترويسة ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="السنة المالية" value={receipt.fiscalYear} />
          <Field label="الجهة" value={receipt.entityName} />
          <Field label="رقم الجهة" value={receipt.entityNumber} />
          <Field label="مستودع" value={receipt.warehouseName} />
          <Field label="المورد" value={receipt.supplier} />
          <Field
            label={shape.dateLabel}
            value={
              receipt.receiptDate ? <DateS date={receipt.receiptDate} /> : null
            }
          />
          {shape.references.map((reference) => (
            <Field
              key={reference.numberField}
              label={reference.label}
              value={
                receipt[reference.numberField as keyof typeof receipt] as
                  | string
                  | null
              }
            />
          ))}
        </dl>
      </section>

      {/* ── الأصناف ── */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3>الأصناف</h3>
          <span className="text-sm text-gray-600">
            {receipt.lines.length} سطراً · {totalItems} سجلاً في النظام
          </span>
        </div>

        {missingItems > 0 && receipt.state !== ReceiptState.VOIDED ? (
          <div className="mb-3 rounded border border-warning-300 bg-warning-50 p-3 text-sm text-warning-700">
            <p className="mb-2">
              لم تكتمل سجلات هذا النموذج: أُنشئ {totalItems} من أصل{" "}
              {expectedItems}. تعذّر إنشاء الباقي عند الحفظ، والأصناف الناقصة
              غير موجودة في النظام.
            </p>
            {canRepair ? (
              <Form method="post">
                <input type="hidden" name="intent" value="materialize" />
                <Button type="submit" variant="secondary" size="sm">
                  استكمال إنشاء الأصناف
                </Button>
              </Form>
            ) : null}
          </div>
        ) : null}

        <Table>
          <thead>
            <Tr className="text-start">
              <Th>#</Th>
              <Th>{shape.itemCodeLabel}</Th>
              <Th>اسم الصنف</Th>
              <Th>الوحدة</Th>
              <Th>الكمية</Th>
              <Th>النوع</Th>
              <Th>التصنيف</Th>
              <Th>سعر الوحدة</Th>
              <Th>مجموع القيمة</Th>
              <Th>السجلات</Th>
            </Tr>
          </thead>
          <tbody>
            {receipt.lines.map((line) => (
              <Tr key={line.id}>
                <Td>{line.lineNumber}</Td>
                <Td>{line.itemCode ?? "—"}</Td>
                <Td>
                  <div className="font-medium">{line.name}</div>
                  {line.description ? (
                    <div className="text-xs text-gray-500">
                      {line.description}
                    </div>
                  ) : null}
                </Td>
                <Td>{line.unit ?? "—"}</Td>
                <Td>{line.quantity}</Td>
                <Td>{categoryLabel(line.itemCategory)}</Td>
                <Td>
                  {/*
                   * The classification stored with the line, not recomputed
                   * here: an item keeps the treatment it was admitted under
                   * even if the thresholds are revised later.
                   */}
                  {itemClassLabel(line.itemClass)}
                </Td>
                <Td dir="ltr" className="text-start">
                  {formatHalalas(line.unitPriceHalalas)}
                </Td>
                <Td dir="ltr" className="text-start">
                  {formatHalalas(line.lineTotalHalalas)}
                </Td>
                <Td>
                  {line._count.assets}
                  <span className="ms-1 text-xs text-gray-500">
                    {line.tracking === "BULK" ? "(بالكمية)" : "(منفصل)"}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>

      {/* ── المجاميع ── */}
      <section className="mb-8 rounded-lg border border-gray-200 p-6">
        <dl className="space-y-2">
          {shape.hasSeparateVat ? (
            <>
              <Total
                label="القيمة الاجمالية"
                halalas={receipt.subtotalHalalas}
              />
              <Total
                label="مجموع ضريبة القيمة المضافة"
                halalas={receipt.vatHalalas}
              />
            </>
          ) : null}
          <div className="border-t border-gray-200 pt-2">
            <Total
              label={shape.totalLabel}
              halalas={receipt.totalHalalas}
              bold
            />
          </div>
        </dl>
      </section>

      {/* ── التواقيع ── */}
      <SignatureBoxes
        shape={shape}
        signatures={receipt.signatures}
        signatureUrls={signatureUrls}
        disabled={receipt.state === ReceiptState.VOIDED}
      />

      <div className="mt-8">
        <Button variant="secondary" to="/receipts">
          العودة إلى نماذج الاستلام
        </Button>
      </div>
    </div>
  );
}

/** One label/value pair in the header block. */
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}

/** One row of the totals block. */
function Total({
  label,
  halalas,
  bold,
}: {
  label: string;
  halalas: number;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        bold ? "text-lg font-semibold" : ""
      }`}
    >
      <dt>{label}</dt>
      <dd dir="ltr">{formatHalalas(halalas)}</dd>
    </div>
  );
}
