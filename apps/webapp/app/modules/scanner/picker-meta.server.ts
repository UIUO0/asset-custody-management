/**
 * Per-scan strict-available pool computation for the QR-scanner
 * drawers (location, kit, booking).
 *
 * Each scanner drawer wants the same "· X available" / "qty input
 * MAX" UX the manage-assets picker shows. The picker computes this
 * via dedicated per-context helpers; this module wraps the three so
 * the scanner can dispatch by a single `pickerContext` query param.
 *
 * Returns `null` for INDIVIDUAL assets — the drawers don't render a
 * qty input or an "available" annotation for them.
 *
 * @see {@link file://./../location/picker-meta.server.ts} `getLocationPickerMeta`
 * @see {@link file://./../kit/picker-meta.server.ts} `getKitPickerMeta`
 * @see {@link file://./../../routes/_layout+/bookings.$bookingId.overview.manage-assets.tsx}
 *   booking picker's inline availability formula (Phase 4b)
 */

import { AssetType } from "@prisma/client";
import { z } from "zod";
import { db } from "~/database/db.server";
import { getLocationPickerMeta } from "~/modules/location/picker-meta.server";

/** Identifies which destination the scanner is feeding. */
export const ScannerPickerContextSchema = z.object({
  type: z.enum(["location", "kit"]),
  id: z.string().min(1),
});

export type ScannerPickerContext = z.infer<typeof ScannerPickerContextSchema>;

/**
 * Normalised picker-meta shape returned to scanner drawers. Mirrors
 * the fields each manage-assets picker exposes on a per-row basis but
 * collapses the context-specific names (`maxAllowedForThisLocation`,
 * `maxAllowedForThisKit`) to a uniform `maxAllowed`.
 */
export type ScannerPickerMeta = {
  /** Strict-available pool the qty input is bounded by. */
  maxAllowed: number;
  /** Asset's total quantity — shown alongside MAX in the row label. */
  assetQuantity: number;
  unitOfMeasure: string | null;
};

/**
 * Returns picker meta for a single qty-tracked asset in the given
 * destination, or `null` for INDIVIDUAL assets / when the asset
 * cannot be found in scope.
 */
export async function getScannerPickerMeta({
  assetId,
  organizationId,
  context,
}: {
  assetId: string;
  organizationId: string;
  context: ScannerPickerContext;
}): Promise<ScannerPickerMeta | null> {
  // Fast-fail on INDIVIDUAL — the qty input never renders, no point
  // computing a strict-available pool.
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true, type: true, quantity: true, unitOfMeasure: true },
  });
  if (!asset || asset.type !== AssetType.QUANTITY_TRACKED) return null;

  const totalQty = asset.quantity ?? 0;

  if (context.type === "location") {
    const metaMap = await getLocationPickerMeta({
      locationId: context.id,
      organizationId,
      assetIds: [assetId],
    });
    const meta = metaMap.get(assetId);
    if (!meta) return null;
    return {
      maxAllowed: meta.maxAllowedForThisLocation,
      assetQuantity: totalQty,
      unitOfMeasure: meta.unitOfMeasure,
    };
  }

  /**
   * `context.type` is exhaustive above — the schema admits only "location"
   * and "kit". A third branch used to compute a booking's strict-available
   * pool; it went with the booking system.
   */
  return null;
}
