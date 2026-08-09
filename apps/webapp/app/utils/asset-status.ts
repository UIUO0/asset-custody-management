/**
 * Status unions used by the asset and kit status badges.
 *
 * These lived in `utils/booking-assets.ts` and moved here when bookings were
 * removed. They are plain string-literal unions with no booking dependency of
 * their own — only the code that *produced* the pseudo-statuses was
 * booking-specific.
 *
 * ## The pseudo-statuses are now unreachable
 *
 * `PARTIALLY_CHECKED_IN*` / `PARTIALLY_CHECKED_OUT*` described an asset
 * part-way through a booking check-in or check-out. With bookings gone nothing
 * produces them any more, so the badge branches that render them are dead
 * code — deliberately left in place rather than ripped out in the same change
 * that removed bookings:
 *
 *   - Historical rows may still carry these values in exported CSVs and notes.
 *   - Removing the branches means editing several exhaustive `switch`
 *     statements, which is a separate, independently reviewable change.
 *
 * Once the booking tables are dropped and the data confirmed clean, this union
 * can be narrowed to just `AssetStatus` / `KitStatus` and the dead branches
 * deleted with it.
 *
 * @see {@link file://./../components/assets/asset-status-badge/status-labels.ts}
 */

import type { AssetStatus, KitStatus } from "@prisma/client";

/** Persisted {@link AssetStatus} plus the legacy booking-context pseudo-statuses. */
export type ExtendedAssetStatus =
  | AssetStatus
  | "PARTIALLY_CHECKED_IN"
  | "PARTIALLY_CHECKED_IN_QTY"
  | "PARTIALLY_CHECKED_OUT_QTY"
  | "PARTIALLY_CHECKED_OUT_QTY_PENDING_RETURN";

/** Persisted {@link KitStatus} plus the legacy booking-context pseudo-status. */
export type ExtendedKitStatus = KitStatus | "PARTIALLY_CHECKED_IN";
