/**
 * Status Label Helpers
 *
 * Pure mappings from {@link AssetStatus} to user-facing label strings and badge
 * colour schemes. Reused by the asset status badge UI and by callers that
 * render the same status in other contexts (the dashboard, filter summaries,
 * the advanced-filters value picker).
 *
 * ## The booking pseudo-statuses are gone
 *
 * `PARTIALLY_CHECKED_IN*` / `PARTIALLY_CHECKED_OUT*` described an asset
 * part-way through a booking check-in or check-out. Nothing has produced them
 * since bookings were removed, so every branch here was unreachable — and each
 * carried a colour rule (amber vs violet) documenting a distinction between two
 * states that can no longer occur.
 *
 * No React, no I/O — safe to import from server-only modules.
 */

import { AssetStatus } from "@prisma/client";
import { ASSET_STATUS_LABELS } from "@shelf/labels";
import { BADGE_COLORS, type BadgeColorScheme } from "~/utils/badge-colors";

/**
 * Maps a status to its user-facing label.
 *
 * All label strings come from the shared `@shelf/labels` package, which is the
 * single source of truth for this wording.
 *
 * @param status The asset status
 * @returns Short human-readable label suitable for a badge
 */
export const userFriendlyAssetStatus = (status: AssetStatus) => {
  switch (status) {
    case AssetStatus.IN_CUSTODY:
      return ASSET_STATUS_LABELS.IN_CUSTODY;
    case AssetStatus.CHECKED_OUT:
      return ASSET_STATUS_LABELS.CHECKED_OUT;
    default:
      return ASSET_STATUS_LABELS.AVAILABLE;
  }
};

/**
 * Maps a status to its badge colour scheme. Pairs with
 * {@link userFriendlyAssetStatus}.
 */
export const assetStatusColorMap = (status: AssetStatus): BadgeColorScheme => {
  switch (status) {
    case AssetStatus.IN_CUSTODY:
      return BADGE_COLORS.blue;
    case AssetStatus.CHECKED_OUT:
      return BADGE_COLORS.violet;
    default:
      // AVAILABLE
      return BADGE_COLORS.green;
  }
};
