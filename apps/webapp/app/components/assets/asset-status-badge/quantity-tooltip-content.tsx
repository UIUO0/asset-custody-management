/**
 * Quantity Breakdown Tooltip
 *
 * Renders the hover-card body for a quantity-tracked asset: how many units are
 * in custody, and how many are still on the shelf.
 *
 * ## What used to be here
 *
 * A per-booking breakdown — "12 of 30 checked out", reserved slices, standalone
 * vs via-kit buckets, each booking name linking to `/bookings/:id`. It went
 * with the booking system: `getAssetQuantityRows` stopped selecting
 * `bookingAssets` when bookings were removed, so every one of those branches
 * was rendering from an array that is now always empty — and the links pointed
 * at a route that no longer exists.
 *
 * Lives next to {@link AssetStatusBadge} but separately so the badge file stays
 * focused on the wrapper / lazy-fetch orchestration.
 *
 * @see {@link file://./asset-status-badge.tsx}
 * @see {@link file://./quantity-data.ts}
 */

import { tw } from "~/utils/tw";
import type { QuantityBreakdown } from "./quantity-data";

/**
 * Renders the hover-card content for a quantity-tracked asset.
 *
 * @param data - The breakdown from `getQuantityData`
 */
export function QuantityTooltipContent({ data }: { data: QuantityBreakdown }) {
  const { total, inCustody, available } = data;

  return (
    // HoverCard shell is `bg-white` — use readable grays in the 600-800
    // range and let the headline stay at default (near-black).
    <div className="space-y-1 text-xs text-gray-800">
      {inCustody > 0 && (
        <p className="text-gray-700">
          {inCustody} of {total} in custody
        </p>
      )}

      {/* Available line — emerald when non-zero so the "there is still stock"
          signal pops; muted gray when zero. */}
      <p
        className={tw(
          "font-medium",
          available > 0 ? "text-emerald-700" : "text-gray-500",
        )}
      >
        {available} available
      </p>
    </div>
  );
}
