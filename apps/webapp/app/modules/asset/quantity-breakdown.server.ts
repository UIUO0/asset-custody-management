/**
 * Asset Quantity Breakdown (server)
 *
 * Single source of truth for fetching the per-kit quantity slices a
 * QUANTITY_TRACKED asset needs. The returned object conforms to the
 * {@link QuantityAwareAsset} contract so callers can feed it straight into
 * `getQuantityData` (the pure reducer in
 * `~/components/assets/asset-status-badge/quantity-data.ts`).
 *
 * Extracted from the inline logic that previously lived in the web
 * `/api/assets/$assetId/quantity-breakdown` loader. It had a second consumer at
 * the time — the mobile asset-detail endpoint — which went with the companion
 * app in 2026-08-06; the extraction is kept because the loader is still the
 * wrong place for the arithmetic, not because two callers share it.
 *
 * The booking half of this breakdown was dropped with the booking system
 * itself: EPDA moves assets on custody records, so custody and kit
 * allocation are the only consumers of a quantity-tracked pool.
 *
 * @see {@link file://./../../routes/api+/assets.$assetId.quantity-breakdown.ts}
 * @see {@link file://./../../components/assets/asset-status-badge/quantity-data.ts}
 */

import type { ExtendedPrismaClient } from "~/database/db.server";
import { ShelfError } from "~/utils/error";

/** Arguments for {@link getAssetQuantityRows}. */
type GetAssetQuantityRowsArgs = {
  /** The asset to fetch quantity slices for. */
  assetId: string;
  /** Org the caller is scoped to — enforces multi-tenant isolation. */
  organizationId: string;
};

/**
 * Fetches the quantity-breakdown slices for a single asset.
 *
 * @param db - Prisma client (or transaction) to read through.
 * @param args - The org-scoped asset to fetch (see {@link GetAssetQuantityRowsArgs}).
 * @returns The asset row with its custody and kit slices.
 * @throws {ShelfError} 404 when the asset is not found in the caller's org.
 */
export async function getAssetQuantityRows(
  db: ExtendedPrismaClient,
  { assetId, organizationId }: GetAssetQuantityRowsArgs,
) {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: {
      id: true,
      type: true,
      quantity: true,
      custody: { select: { quantity: true } },
      assetKits: {
        select: {
          id: true,
          quantity: true,
          kit: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!asset) {
    throw new ShelfError({
      cause: null,
      label: "Assets",
      message: "Asset not found",
      status: 404,
      shouldBeCaptured: false,
    });
  }

  return asset;
}
