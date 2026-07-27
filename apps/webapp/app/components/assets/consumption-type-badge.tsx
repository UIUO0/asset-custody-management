/**
 * Consumption-type badge
 *
 * Minimal pill that surfaces the `consumptionType` of a QUANTITY_TRACKED
 * asset — "Returnable" (TWO_WAY) or "Consumable" (ONE_WAY). Renders
 * nothing for INDIVIDUAL assets or when the type is unset, so call sites
 * can drop it in without further guards.
 *
 * @see {@link file://./asset-status-badge.tsx}
 */

import type { ConsumptionType } from "@prisma/client";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/shared/tooltip";
import { tw } from "~/utils/tw";

/** Props for the ConsumptionTypeBadge component */
export interface ConsumptionTypeBadgeProps {
  /** Asset's consumption type. May be null for INDIVIDUAL assets. */
  consumptionType?: ConsumptionType | null;
  /** Optional extra class names for layout tweaks from the parent. */
  className?: string;
}

/**
 * Renders a compact pill indicating whether a qty-tracked asset is
 * returnable or consumable. Returns `null` when the type isn't set.
 *
 * Design choices:
 * - Muted gray styling so it sits beside higher-priority badges (status,
 *   availability) without competing with them.
 * - Radix tooltip on hover explains the semantics in one sentence —
 *   this is a secondary signal, not a thing the user interacts with,
 *   but new users benefit from the short gloss.
 */
export function ConsumptionTypeBadge({
  consumptionType,
  className,
}: ConsumptionTypeBadgeProps) {
  const { t } = useTranslation();
  if (!consumptionType) return null;

  const isReturnable = consumptionType === "TWO_WAY";
  const label = isReturnable ? t("assets.returnable") : t("assets.consumable");
  const tooltipTitle = isReturnable
    ? t("assets.returnableTwoWay")
    : t("assets.consumableOneWay");
  const tooltipBody = isReturnable
    ? t("assets.returnableTwoWayTooltip")
    : t("assets.consumableOneWayTooltip");

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={tw(
              "inline-flex cursor-help items-center rounded-md border border-gray-200 bg-gray-50",
              "px-[6px] py-[2px] text-xs text-gray-600",
              className,
            )}
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-w-xs">
          <div className="flex flex-col gap-1 text-xs">
            <div className="font-semibold text-gray-900">{tooltipTitle}</div>
            <p className="text-gray-600">{tooltipBody}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
