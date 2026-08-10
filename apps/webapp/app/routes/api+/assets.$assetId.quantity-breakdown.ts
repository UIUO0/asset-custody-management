/**
 * Quantity Breakdown API
 *
 * Returns the data the `AssetStatusBadge` needs to render the qty-aware
 * tooltip for a QUANTITY_TRACKED asset (per-kit slice breakdown). Called
 * lazily on tooltip-hover from index / picker / scanner-drawer surfaces so
 * the SSR loader doesn't pay the per-row cost up-front; the asset detail
 * page passes the breakdown inline via the loader instead.
 *
 * Shape matches what `getQuantityData` in `asset-status-badge.tsx`
 * expects — `custody[]`, `assetKits[]` — so the client can feed the
 * response straight into the same renderer used for the inline path.
 *
 * @see {@link file://./../../components/assets/asset-status-badge.tsx}
 */

import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { db } from "~/database/db.server";
import { getAssetQuantityRows } from "~/modules/asset/quantity-breakdown.server";
import { makeShelfError } from "~/utils/error";
import { payload, error, getParams } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  const { assetId } = getParams(params, z.object({ assetId: z.string() }));

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    // Fetch the org-scoped quantity slices. The arithmetic lives in the
    // helper rather than in this loader — see its docblock.
    const rows = await getAssetQuantityRows(db, { assetId, organizationId });

    return data(payload(rows));
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, assetId });
    throw data(error(reason), { status: reason.status });
  }
}
