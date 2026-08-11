/**
 * Quantity Overview Card
 *
 * Displays a summary of quantity-tracking information for QUANTITY_TRACKED assets
 * on the asset detail overview page. Shows total quantity, available units,
 * units in custody, unit of measure,
 * optional low-stock alert threshold, and the consumption behavior mode.
 *
 * Availability and in-custody values are computed by the loader from actual
 * custody records and booking reservations, then passed as props.
 * Falls back to total/0 if not provided.
 *
 * @see {@link file://./../../routes/_layout+/assets.$assetId.overview.tsx} - Asset overview page
 * @see {@link file://./asset-custody-card.tsx} - Similar sidebar card pattern
 */

import type React from "react";
import type { ConsumptionType } from "@prisma/client";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/shared/button";
import { Card } from "~/components/shared/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/shared/tooltip";
import { tw } from "~/utils/tw";
import { QuickAdjustDialog } from "./quick-adjust-dialog";

/** Props for the QuantityOverviewCard component */
export interface QuantityOverviewCardProps {
  /** The asset's unique ID, used by the quick-adjust dialog */
  assetId: string;
  /** Total quantity of the asset */
  quantity: number | null;
  /** Unit of measure label (e.g., "pcs", "boxes", "liters") */
  unitOfMeasure: string | null;
  /** Low-stock alert threshold; when quantity <= minQuantity, a warning badge appears */
  minQuantity: number | null;
  /** Consumption behavior: ONE_WAY (used up) or TWO_WAY (returnable) */
  consumptionType: ConsumptionType | null;
  /**
   * Availability (total - inCustody),
   * shown on the "Available" row. This is what's available to reserve for a
   * future booking.
   */
  availableQuantity?: number;
  /**
   * Physical availability (total - inCustody). Used as the cap for the
   * QuickAdjustDialog's "Remove" operation — subtracting reservations here
   * would wrongly block valid total-quantity adjustments when future
   * bookings exist. Falls back to `availableQuantity` when not provided.
   */
  custodyAvailableQuantity?: number;
  /**
   * Operator-only custody (excludes kit-allocated rows). Surfaced on the
   * "In custody" row.
   */
  inCustodyQuantity?: number;
  /**
   * Sum of `AssetKit.quantity` across every kit this asset participates in.
   * Surfaced on its own "In kits" row when > 0 so users see how many units
   * are earmarked for kit use — these are not free stock.
   */
  /**
   * Sum of `AssetLocation.quantity` across every location this asset is
   * placed at. Surfaced on its own "In locations" row when > 0; the
   * remainder (`quantity − inLocationsQuantity`) is the "unplaced" pool.
   * Does NOT subtract from `available` — placements are orthogonal to
   * custody / bookings, so a unit can be at Location X AND in custody
   * simultaneously without double-counting.
   */
  inLocationsQuantity?: number;
  /** Whether the user has permission to adjust quantity */
  canUpdate?: boolean;
  /** Optional additional CSS class names */
  className?: string;
}

/**
 * Formats a numeric value with an optional unit suffix.
 *
 * @param value - The numeric value to display
 * @param unit - Optional unit of measure string
 * @returns Formatted string like "10 pcs" or "10"
 */
function formatWithUnit(value: number, unit: string | null): string {
  return unit ? `${value} ${unit}` : `${value}`;
}

/**
 * Renders a single row in the quantity overview card.
 *
 * @param props.label - Row label displayed on the left
 * @param props.value - Row value displayed on the right
 * @param props.warning - When true, renders the value in amber with a warning icon
 */
function OverviewRow({
  label,
  value,
  warning,
}: {
  label: string;
  value: React.ReactNode;
  warning?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-b-0">
      <span className="text-[14px] text-gray-600">{label}</span>
      <span className="flex items-center gap-1.5 text-[14px] font-medium text-gray-900">
        {warning ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <TriangleAlertIcon className="size-4 text-amber-500" />
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="text-xs">{t("quantity.lowStockTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {value}
      </span>
    </div>
  );
}

/**
 * Sidebar card showing quantity-tracking details for a QUANTITY_TRACKED asset.
 *
 * Displays total quantity, availability, custody count, booking reservations
 * unit of measure, optional low-stock threshold,
 * and consumption behavior mode. Shows a "Low Stock" badge when quantity is
 * at or below the configured minimum.
 *
 * @param props - Quantity fields from the asset record
 * @returns Card element, or null if quantity data is missing
 */
export function QuantityOverviewCard({
  assetId,
  quantity,
  unitOfMeasure,
  minQuantity,
  consumptionType,
  availableQuantity,
  custodyAvailableQuantity,
  inCustodyQuantity,
  inLocationsQuantity,
  canUpdate = false,
  className,
}: QuantityOverviewCardProps) {
  const { t } = useTranslation();
  const qty = quantity ?? 0;
  const unit = unitOfMeasure || null;
  const inLocations = inLocationsQuantity ?? 0;
  const unplaced = Math.max(0, qty - inLocations);

  /** Use computed values from the loader, falling back to phase-1 defaults */
  const available = availableQuantity ?? qty - (inCustodyQuantity ?? 0);
  const inCustody = inCustodyQuantity ?? 0;

  /** Low stock when a threshold is set and available quantity is at or below it */
  const isLowStock = minQuantity != null && available <= minQuantity;

  /** Human-readable behavior label */
  const behaviorLabel =
    consumptionType === "ONE_WAY"
      ? t("quantity.usedUpOneWay")
      : consumptionType === "TWO_WAY"
      ? t("assets.returnableTwoWay")
      : t("quantity.notApplicable");

  return (
    <Card className={tw("my-3 p-0", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-[14px] font-semibold text-gray-900">
          {t("quantity.overviewTitle")}
        </h3>
        {canUpdate ? (
          <QuickAdjustDialog
            assetId={assetId}
            unitOfMeasure={unitOfMeasure}
            availableQuantity={custodyAvailableQuantity ?? available}
            trigger={
              <Button type="button" variant="secondary" size="sm">
                {t("quantity.adjust")}
              </Button>
            }
          />
        ) : null}
      </div>

      {/* Detail rows */}
      <OverviewRow
        label={t("quantity.totalQuantity")}
        value={formatWithUnit(qty, unit)}
      />
      <OverviewRow
        label={t("quantity.available")}
        value={formatWithUnit(available, unit)}
        warning={isLowStock}
      />
      {/* "In locations" only renders when > 0 so
          assets with no placements stay uncluttered. Always sits next
          to t("quantity.unplaced") for the at-a-glance placed/unplaced split.
          Detailed per-location breakdown lives in the dedicated
          t("assetOverview.placedAtLocations") card. */}
      {inLocations > 0 ? (
        <OverviewRow
          label={t("quantity.inLocations")}
          value={formatWithUnit(inLocations, unit)}
        />
      ) : null}
      {inLocations > 0 && unplaced > 0 ? (
        <OverviewRow
          label={t("quantity.unplaced")}
          value={formatWithUnit(unplaced, unit)}
        />
      ) : null}
      <OverviewRow
        label={t("quantity.inCustody")}
        value={formatWithUnit(inCustody, unit)}
      />
      <OverviewRow
        label={t("quantity.unitOfMeasure")}
        value={unit ?? t("quantity.notApplicable")}
      />
      {minQuantity != null ? (
        <OverviewRow
          label={t("quantity.minQuantityAlert")}
          value={formatWithUnit(minQuantity, unit)}
        />
      ) : null}
      <OverviewRow label={t("quantity.behavior")} value={behaviorLabel} />
    </Card>
  );
}
