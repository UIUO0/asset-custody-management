/**
 * `/assets/:assetId/finance` — المالية's view of one asset. **Placeholder.**
 *
 * Deliberately unbuilt: the authority has not yet said what المالية needs on an
 * asset beyond the coding number (depreciation start, useful life, book value,
 * the الإهلاك fields from phase 2 of the workflow spec). Guessing a layout now
 * would mean building a screen twice and, worse, shipping fields that look
 * authoritative while holding invented data.
 *
 * The route exists rather than 404ing so the link from the purchase-order
 * screen has somewhere honest to land, and so the shape of the page — who may
 * open it, what it is scoped to — is settled before the content arrives.
 *
 * **Coding does not wait on this page.** رقم الترميز is entered inline on
 * `/purchase-orders/:orderNumber`, where المالية already reads the order. This
 * page is for the richer per-asset finance view that comes later.
 *
 * @see {@link file://./purchase-orders.$orderNumber.tsx} where coding happens today
 * @see {@link file://./../../../../docs/org-workflow-and-roles.md} phase 2 — الإهلاك
 */

import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { db } from "~/database/db.server";
import { categoryLabel } from "~/modules/goods-receipt/capitalization";
import { itemClassLabel } from "~/modules/goods-receipt/classification";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError, ShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta = () => [{ title: appendToMetaTitle("الصنف — المالية") }];

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    // Org-scoped in the `where`, so a foreign id reads as "not found" rather
    // than being fetched and then checked.
    const asset = await db.asset.findFirst({
      where: { id: params.assetId, organizationId },
      select: {
        id: true,
        title: true,
        sequentialId: true,
        itemClass: true,
        itemCategory: true,
        financeCode: true,
        valuation: true,
      },
    });

    if (!asset) {
      throw new ShelfError({
        cause: null,
        message: "الصنف غير موجود.",
        additionalData: { assetId: params.assetId, organizationId },
        label: "Assets",
        status: 404,
        shouldBeCaptured: false,
      });
    }

    return payload({ asset });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export default function AssetFinancePage() {
  const { asset } = useLoaderData<typeof loader>();

  return (
    <div className="relative">
      <Header title={asset.title} />

      <section className="mb-6 rounded-lg border border-gray-200 p-6">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-sm text-gray-500">المعرّف المتسلسل</dt>
            <dd className="font-medium">{asset.sequentialId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">نوع الصنف</dt>
            <dd className="font-medium">{categoryLabel(asset.itemCategory)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">التصنيف</dt>
            <dd className="font-medium">{itemClassLabel(asset.itemClass)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">رقم الترميز</dt>
            <dd className="font-medium" dir="ltr">
              {asset.financeCode ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
        <h3 className="mb-2">صفحة الأصل المالية — تحت الإنشاء</h3>
        <p className="mx-auto mb-6 max-w-xl text-gray-600">
          ستضمّ هذه الصفحة بيانات الأصل المالية: الإهلاك وتاريخ بدايته، والعمر
          الإنتاجي، والقيمة الدفترية. لم تُحدَّد حقولها بعد.
        </p>
        <p className="mb-6 text-sm text-gray-500">
          الترميز متاح الآن من صفحة أمر الشراء — لا حاجة لانتظار هذه الصفحة.
        </p>
        <Button to="/purchase-orders" variant="secondary">
          الذهاب إلى أوامر الشراء
        </Button>
      </section>
    </div>
  );
}
