/**
 * Asset Status Badge
 *
 * The badge shown next to an asset's title across the app. Picks the right
 * label + colour for the asset's status, and for QUANTITY_TRACKED assets
 * renders a "Partial custody" treatment with a hover-card breakdown of units
 * held versus units on the shelf.
 *
 * **Performance:** the qty-aware breakdown is lazy-fetched on the first cursor
 * enter via `/api/assets/:id/quantity-breakdown`, so an index of 100 rows pays
 * zero per-row cost up-front. When the asset detail page passes the slices
 * inline through `asset`, the hover-card is instant.
 *
 * ## What the booking removal took out of here
 *
 * Three things, all of them dead rather than merely unused:
 *
 *  - **A fetch to `/api/assets/:id/ongoing-booking`**, fired for every
 *    INDIVIDUAL asset in `CHECKED_OUT`. That route no longer exists, so the
 *    request 404'd and the hover-card it fed never opened.
 *  - **`suppressQtyAware`**, the escape hatch for booking rows. Its only
 *    callers were booking surfaces; nothing passes it now.
 *  - **The booking-context pseudo-statuses** (`PARTIALLY_CHECKED_IN…`), which
 *    nothing produces.
 *
 * @see {@link file://./quantity-data.ts}
 * @see {@link file://./quantity-tooltip-content.tsx}
 * @see {@link file://./../../../routes/api+/assets.$assetId.quantity-breakdown.ts}
 */

import { useMemo, useState } from "react";
import type { AssetStatus } from "@prisma/client";
import { HoverCardPortal } from "@radix-ui/react-hover-card";
import { useTranslation } from "react-i18next";
import useApiQuery from "~/hooks/use-api-query";
import { isQuantityTracked } from "~/modules/asset/utils";
import { BADGE_COLORS } from "~/utils/badge-colors";
import {
  getQuantityBadgeLabelAndColor,
  getQuantityData,
  type QuantityAwareAsset,
} from "./quantity-data";
import { QuantityTooltipContent } from "./quantity-tooltip-content";
import { assetStatusColorMap, userFriendlyAssetStatus } from "./status-labels";
import { Badge } from "../../shared/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../shared/hover-card";

export function AssetStatusBadge({
  id,
  status,
  asset,
}: {
  id: string;
  status: AssetStatus;
  /**
   * When provided, the badge auto-detects quantity-tracked assets and
   * renders a quantity-aware status (e.g., "Partial custody") with a
   * tooltip showing the breakdown. The asset must include `type`,
   * `quantity`, and `custody` fields for quantity display to work.
   * Falls back to standard status if data is missing.
   */
  asset?: QuantityAwareAsset | null;
}) {
  const inlineQuantityData = useMemo(() => getQuantityData(asset), [asset]);

  const { t } = useTranslation();

  /**
   * Localised status label, falling back to the shared `@shelf/labels` wording
   * when a status has no translation key.
   */
  const statusLabel = t(`status.${status}`, userFriendlyAssetStatus(status));

  // Whether the asset is actually QT (by schema type). Gates the qty-aware
  // render branch.
  const isQtyTracked = asset ? isQuantityTracked(asset) : false;

  /**
   * Lazy-fetch the breakdown for qty-tracked assets that didn't get their
   * slices from the loader (asset index, picker rows, scanner drawer, etc.).
   * The fetch is gated on `hasInteracted` so unhovered rows on a 100-row index
   * don't fan out N parallel requests. Once the cursor enters the badge we kick
   * the request off — by the time the Radix hover-card opens (~150ms later) the
   * data is usually ready.
   */
  const [hasInteracted, setHasInteracted] = useState(false);
  const needsLazyBreakdown = isQtyTracked && !inlineQuantityData;
  const { data: lazyAsset } = useApiQuery<QuantityAwareAsset>({
    api: `/api/assets/${id}/quantity-breakdown`,
    enabled: needsLazyBreakdown && hasInteracted,
  });
  const lazyQuantityData = useMemo(
    () => getQuantityData(lazyAsset ?? null),
    [lazyAsset],
  );
  const quantityData = inlineQuantityData ?? lazyQuantityData;

  if (
    (asset as { lifecycleStage?: string } | null | undefined)
      ?.lifecycleStage === "PENDING"
  ) {
    const colors = BADGE_COLORS.gray;
    return (
      <span className="flex items-center gap-1.5">
        <Badge color={colors.bg} textColor={colors.text}>
          {t("status.PENDING")}
        </Badge>
      </span>
    );
  }

  /**
   * For quantity-tracked assets, render the qty-aware branch even before the
   * lazy fetch resolves. The label falls back to the asset's bare status until
   * the breakdown lands; on resolve, "In custody" may refine to "Partial
   * custody". The hover-card stays closed until data is available.
   */
  if (isQtyTracked) {
    const { label, colors } = quantityData
      ? getQuantityBadgeLabelAndColor(quantityData)
      : { label: statusLabel, colors: assetStatusColorMap(status) };

    return (
      <span
        className="flex items-center gap-1.5"
        onMouseEnter={
          needsLazyBreakdown && !hasInteracted
            ? () => setHasInteracted(true)
            : undefined
        }
      >
        <HoverCard openDelay={150} closeDelay={150}>
          <HoverCardTrigger asChild>
            <span>
              <Badge color={colors.bg} textColor={colors.text}>
                {label}
              </Badge>
            </span>
          </HoverCardTrigger>
          {/* Mirror the label decision: the breakdown popover would be
              misleading next to a plain status chip, so it only mounts once
              the qty-aware label is the one being shown. */}
          {quantityData && (
            <HoverCardPortal>
              <HoverCardContent
                side="bottom"
                className="w-[26rem] max-w-[calc(100vw-2rem)]"
              >
                <QuantityTooltipContent data={quantityData} />
              </HoverCardContent>
            </HoverCardPortal>
          )}
        </HoverCard>
      </span>
    );
  }

  const colors = assetStatusColorMap(status);

  return (
    <span className="flex items-center gap-1.5">
      <Badge color={colors.bg} textColor={colors.text}>
        {statusLabel}
      </Badge>
    </span>
  );
}
