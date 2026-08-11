import { db } from "~/database/db.server";
import { getAssetsWhereInput } from "~/modules/asset/utils.server";
import { getCurrentSearchParams } from "~/utils/http.server";
import { ALL_SELECTED_KEY } from "~/utils/list";

/**
 * Resolves asset IDs for bulk location operations.
 * Handles ALL_SELECTED_KEY expansion using asset filters + the
 * `AssetLocation` pivot (Phase 4b) to scope to a single location.
 */
export async function resolveLocationAssetIds({
  ids,
  organizationId,
  locationId,
  request,
}: {
  ids: string[];
  organizationId: string;
  locationId: string;
  request: Request;
}): Promise<string[]> {
  if (!ids.includes(ALL_SELECTED_KEY)) {
    return ids;
  }

  const searchParams = getCurrentSearchParams(request);
  const assetsWhere = getAssetsWhereInput({
    organizationId,
    currentSearchParams: searchParams.toString(),
  });

  const allAssets = await db.asset.findMany({
    where: {
      ...assetsWhere,
      // Match assets that have an `AssetLocation` pivot row at this location.
      assetLocations: { some: { locationId } },
    },
    select: { id: true },
  });

  return allAssets.map((a) => a.id);
}
