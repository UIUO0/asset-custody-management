/**
 * `/receipts/new` — fill in a مذكرة استلام or محضر استلام.
 *
 * Without `?type=`, shows the picker: the warehouse operator chooses which of
 * the authority's two forms this delivery is being booked in on. With it,
 * renders that form's field set, driven entirely by `form-shape.ts` so the two
 * layouts cannot drift from what the service validates.
 *
 * Saving creates the items immediately at `PENDING` — see the receipt service
 * for why data entry is not gated on the three signatures.
 *
 * @see {@link file://./../../modules/goods-receipt/form-shape.ts} the field sets
 * @see {@link file://./../../modules/goods-receipt/service.server.ts} the write path
 */

import type { GoodsReceiptType } from "@prisma/client";
import {
  MaxFileSizeExceededError,
  parseFormData,
} from "@remix-run/form-data-parser";
// Browser-safe enum values — Prisma's enum objects are undefined on the
// client, and this module's component runs there. See enums.ts.
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { ReceiptForm } from "~/components/goods-receipt/receipt-form";
import { ReceiptTypePicker } from "~/components/goods-receipt/receipt-type-picker";
import Header from "~/components/layout/header";
import { ReceiptType } from "~/modules/goods-receipt/enums";
import { getFormShape } from "~/modules/goods-receipt/form-shape";
import { GoodsReceiptSchema } from "~/modules/goods-receipt/schema";
import { createGoodsReceipt } from "~/modules/goods-receipt/service.server";
import { parseTemplateWorkbook } from "~/modules/goods-receipt/template.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError, ShelfError } from "~/utils/error";
import { payload, error, parseObject } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

/**
 * Upper bound on an uploaded template.
 *
 * A filled workbook is tens of kilobytes; this is a guard against a request
 * that is not one, not a limit an operator can reach by filling the form in.
 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Narrows the `?type=` query param to a known form. */
function parseType(value: string | null): GoodsReceiptType | null {
  return value === ReceiptType.MEMO || value === ReceiptType.RECORD
    ? value
    : null;
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    await requirePermission({
      userId,
      request,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.create,
    });

    const type = parseType(new URL(request.url).searchParams.get("type"));

    return payload({
      type,
      // The whole shape goes to the client: it is static configuration with no
      // secrets, and shipping it means the form renders from the same
      // description the server validates against.
      shape: type ? getFormShape(type) : null,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.create,
    });

    /**
     * An uploaded template arrives as multipart, so the branch is chosen from
     * the content type before the body is read — a `request.formData()` on a
     * multipart body and a re-read afterwards is not possible, the stream is
     * consumed once.
     */
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      return await uploadTemplate({ request, organizationId, userId });
    }

    const formData = await request.formData();

    /**
     * The item table posts as `lines[0].name`, `lines[0].quantity`, … so it is
     * reassembled here before validation. Indices come from the DOM and may be
     * sparse after a row is removed, so they are sorted and compacted rather
     * than trusted as a dense sequence.
     */
    const lineIndices = new Set<number>();
    for (const key of formData.keys()) {
      const match = /^lines\[(\d+)]\./.exec(key);
      if (match) lineIndices.add(Number(match[1]));
    }

    const lines = [...lineIndices]
      .sort((a, b) => a - b)
      .map((index) => ({
        itemCode: formData.get(`lines[${index}].itemCode`)?.toString(),
        name: formData.get(`lines[${index}].name`)?.toString() ?? "",
        description: formData.get(`lines[${index}].description`)?.toString(),
        unit: formData.get(`lines[${index}].unit`)?.toString(),
        quantity: formData.get(`lines[${index}].quantity`)?.toString() ?? "1",
        unitPrice: {
          riyals: formData.get(`lines[${index}].unitPriceRiyals`)?.toString(),
          halalas: formData.get(`lines[${index}].unitPriceHalalas`)?.toString(),
        },
        notes: formData.get(`lines[${index}].notes`)?.toString(),
        tracking:
          formData.get(`lines[${index}].tracking`)?.toString() ?? "INDIVIDUAL",
        itemCategory: formData.get(`lines[${index}].itemCategory`)?.toString(),
      }));

    const input = parseObject(
      {
        ...Object.fromEntries(formData),
        // Nested values cannot survive `Object.fromEntries`, so they are
        // reattached after it.
        lines,
        vat: {
          riyals: formData.get("vatRiyals")?.toString(),
          halalas: formData.get("vatHalalas")?.toString(),
        },
      },
      GoodsReceiptSchema,
      { shouldBeCaptured: false },
    );

    const receipt = await createGoodsReceipt({ input, organizationId, userId });

    return redirect(`/receipts/${receipt.id}`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

/**
 * Creates a receipt from an uploaded template.
 *
 * The spreadsheet is only a way of *filling* the form: the parsed values go
 * through the very same `GoodsReceiptSchema` and `createGoodsReceipt` as a
 * typed submission. An upload path with its own validation would be a second
 * door into inventory with a different lock, which is precisely what the
 * receipt-only intake rule exists to prevent.
 *
 * @param args.request - The multipart request
 * @param args.organizationId - Workspace, from the permission check
 * @param args.userId - The warehouse operator uploading
 * @returns A redirect to the created receipt
 * @throws {ShelfError} 400 when no file was sent, the type is unknown, or the
 *   workbook has no readable item table
 */
async function uploadTemplate({
  request,
  organizationId,
  userId,
}: {
  request: Request;
  organizationId: string;
  userId: string;
}) {
  /**
   * Uploads are buffered in memory, so the cap is not cosmetic — without it a
   * single request decides how much RAM the server spends.
   *
   * 5 MB against a template that is tens of kilobytes even at 200 lines: large
   * enough that nobody filling the form honestly will ever meet it, small
   * enough that meeting it means something is wrong with the file.
   */
  let formData;

  try {
    formData = await parseFormData(request, { maxFileSize: MAX_UPLOAD_BYTES });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message:
        cause instanceof MaxFileSizeExceededError
          ? `حجم الملف أكبر من ${
              MAX_UPLOAD_BYTES / 1024 / 1024
            } ميجابايت. تأكّد من أنك ترفع قالب الاستلام لا ملفاً آخر.`
          : "تعذّرت قراءة الملف المرفوع.",
      label: "Assets",
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const type = parseType(formData.get("type")?.toString() ?? null);

  if (!type) {
    throw new ShelfError({
      cause: null,
      message: "نوع النموذج غير معروف.",
      label: "Assets",
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new ShelfError({
      cause: null,
      message: "اختر ملف القالب المعبّأ أولاً.",
      label: "Assets",
      status: 400,
      shouldBeCaptured: false,
    });
  }

  let parsed;

  try {
    parsed = await parseTemplateWorkbook(await file.arrayBuffer(), type);
  } catch (cause) {
    // The parser throws plain `Error`s carrying the Arabic explanation of what
    // is wrong with the sheet — that message is the whole value of the failure,
    // so it is passed through rather than replaced with a generic one.
    throw new ShelfError({
      cause,
      message:
        cause instanceof Error && cause.message
          ? cause.message
          : "تعذّرت قراءة الملف. تأكّد من أنه قالب Excel المنزَّل من النظام.",
      additionalData: { fileName: file.name, type },
      label: "Assets",
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const input = parseObject(
    { ...parsed.header, type, vat: parsed.vat, lines: parsed.lines },
    GoodsReceiptSchema,
    { shouldBeCaptured: false },
  );

  const receipt = await createGoodsReceipt({ input, organizationId, userId });

  return redirect(`/receipts/${receipt.id}`);
}

export const meta = () => [{ title: appendToMetaTitle("نموذج استلام جديد") }];

export default function NewReceiptPage() {
  const { t } = useTranslation();
  const { type, shape } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const errorMessage =
    actionData && "error" in actionData ? actionData.error?.message : null;

  return (
    <div className="relative">
      <Header title={t("receipts.newReceipt")} />

      {errorMessage ? (
        <div className="mb-6 rounded border border-error-300 bg-error-50 p-4 text-error-700">
          {errorMessage}
        </div>
      ) : null}

      {type && shape ? <ReceiptForm shape={shape} /> : <ReceiptTypePicker />}
    </div>
  );
}
