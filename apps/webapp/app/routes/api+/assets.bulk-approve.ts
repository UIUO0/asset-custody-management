/**
 * POST /api/assets/bulk-approve
 *
 * Releases the selected assets from the intake queue (`PENDING` → `READY`).
 * Backs the "approve" entry in the asset index bulk-actions menu.
 *
 * Gated on `asset.approve`, which المالية deliberately do not hold: they code
 * assets, المستودعات decide when employees may see them.
 *
 * Supports select-all across filtered pages via the `ALL_SELECTED_KEY`
 * convention — `currentSearchParams` is forwarded so the service can rebuild
 * the same where-clause the list used.
 *
 * @see {@link file://./../../components/assets/bulk-approve-dialog.tsx}
 * @see {@link file://./../../modules/asset/service.server.ts} `bulkApproveAssets`
 */

import { data, type ActionFunctionArgs } from "react-router";
import { BulkApproveAssetsSchema } from "~/components/assets/bulk-approve-dialog";
import { bulkApproveAssets } from "~/modules/asset/service.server";
import { CurrentSearchParamsSchema } from "~/modules/asset/utils.server";
import { getAssetIndexSettings } from "~/modules/asset-index-settings/service.server";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { assertIsPost, payload, error, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const userId = authSession.userId;

  try {
    assertIsPost(request);

    /**
     * `approve` — not `update`. This is the whole point of the separate
     * action: a role that may edit an asset is not thereby allowed to put it
     * into circulation.
     */
    const { organizationId, canUseBarcodes, role } = await requirePermission({
      request,
      userId,
      entity: PermissionEntity.asset,
      action: PermissionAction.approve,
    });

    // Needed to resolve a select-all: simple and advanced mode build their
    // filtered id sets differently.
    const settings = await getAssetIndexSettings({
      userId,
      organizationId,
      canUseBarcodes,
      role,
    });

    const formData = await request.formData();

    const { assetIds, currentSearchParams } = parseData(
      formData,
      BulkApproveAssetsSchema.and(CurrentSearchParamsSchema),
    );

    const approvedCount = await bulkApproveAssets({
      organizationId,
      assetIds,
      userId,
      currentSearchParams,
      settings,
    });

    sendNotification({
      title: "Assets approved",
      message:
        approvedCount > 0
          ? `${approvedCount} asset(s) are now ready for distribution.`
          : "None of the selected assets were pending.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return data(payload({ success: true, approvedCount }));
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
