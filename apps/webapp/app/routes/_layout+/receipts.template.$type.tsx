/**
 * `/receipts/template/:type` — download the spreadsheet template for a form.
 *
 * A resource route: no component, just the workbook. Gated on
 * `goodsReceipt.create`, not `read` — the template exists to be filled in and
 * uploaded, and handing it to a role that cannot create a receipt would be
 * offering a door they cannot walk through.
 *
 * The workbook is built per request rather than cached on disk: it is derived
 * from `form-shape.ts`, so a cached copy is a copy that goes stale the moment a
 * reference is added to a form — which is the exact drift the shared shape
 * exists to prevent. Building it costs milliseconds.
 *
 * @see {@link file://./../../modules/goods-receipt/template.server.ts} the writer
 * @see {@link file://./receipts.new.tsx} where it is uploaded back
 */

import type { GoodsReceiptType } from "@prisma/client";
import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { ReceiptType } from "~/modules/goods-receipt/enums";
import { templateFileName } from "~/modules/goods-receipt/template";
import { buildTemplateWorkbook } from "~/modules/goods-receipt/template.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    await requirePermission({
      userId,
      request,
      entity: PermissionEntity.goodsReceipt,
      action: PermissionAction.create,
    });

    const type = params.type;

    if (type !== ReceiptType.MEMO && type !== ReceiptType.RECORD) {
      throw new ShelfError({
        cause: null,
        message: "نوع النموذج غير معروف.",
        additionalData: { type },
        label: "Assets",
        status: 404,
        shouldBeCaptured: false,
      });
    }

    const workbook = await buildTemplateWorkbook(type as GoodsReceiptType);

    return new Response(new Uint8Array(workbook), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        /*
         * `filename*` with UTF-8 encoding, and no plain `filename` fallback
         * carrying mojibake: the name is Arabic, and a latin-1 `filename` is
         * what turns «قالب مذكرة استلام» into question marks in the download
         * bar. Every browser this app supports reads `filename*`.
         */
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          templateFileName(type as GoodsReceiptType),
        )}`,
        // Derived from code that changes with deployments, and small enough
        // that re-fetching costs nothing.
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}
