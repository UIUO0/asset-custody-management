/**
 * Small tooltip badge explaining why an item cannot be acted on.
 *
 * Extracted from `components/booking/availability-label.tsx` when bookings were
 * removed. That module was thoroughly booking-coupled (it read booking status,
 * conflicts and booking route types), but this badge is pure presentation and
 * is what the scanner drawers, the audit drawer and the label factory actually
 * consumed — so it outlives bookings while the rest of that file did not.
 *
 * @see {@link file://./../scanner/drawer/availability-label-factory.tsx}
 */

import type { ReactNode } from "react";
import { tw } from "~/utils/tw";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

/** Colour treatment for the badge shell. */
export type AvailabilityBadgeVariant = "warning" | "error";

/**
 * @param badgeText - Short user-facing label, e.g. "In custody"
 * @param tooltipTitle - Heading inside the tooltip
 * @param tooltipContent - Explanation of what the badge means
 * @param className - Extra classes for the badge shell
 * @param variant - Colour treatment; defaults to amber
 */
export function AvailabilityBadge({
  badgeText,
  tooltipTitle,
  tooltipContent,
  className,
  variant = "warning",
}: {
  badgeText: string;
  tooltipTitle: string;
  tooltipContent: string | ReactNode;
  className?: string;
  variant?: AvailabilityBadgeVariant;
}) {
  // Kept inline rather than driven by `BADGE_COLORS` style props so it composes
  // with the shell's other Tailwind utilities and so call sites passing a
  // custom `className` keep working.
  const variantClasses =
    variant === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-warning-50 border-warning-200 text-warning-700";

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={tw(
              "inline-block px-[6px] py-[2px]",
              "rounded-md border",
              "text-xs",
              "availability-badge",
              variantClasses,
              className,
            )}
          >
            {badgeText}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <div className="max-w-[260px] text-start sm:max-w-[320px]">
            <h6 className="mb-1 text-xs font-semibold text-gray-700">
              {tooltipTitle}
            </h6>
            <div className="whitespace-normal text-xs font-medium text-gray-500">
              {tooltipContent}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
