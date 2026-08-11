import type { ReactNode, FC } from "react";
import type { TFunction } from "i18next";
import { AvailabilityBadge } from "~/components/shared/availability-badge";

/**
 * Configuration type for a single availability label
 */
export type AvailabilityLabelConfig = {
  /** Condition to determine if this label should be shown */
  condition: boolean;
  /** Text to display on the badge */
  badgeText: string;
  /** Title for the tooltip */
  tooltipTitle: string;
  /** Content of the tooltip */
  tooltipContent: ReactNode;
  /** Optional priority for sorting (higher numbers appear first) */
  priority?: number;
  /** Class name to be pased to the availability label */
  className?: string;
};

/**
 * Creates a set of availability labels based on the provided configurations
 * @param configs - Array of label configurations
 * @param options - Optional settings for how labels are displayed
 * @returns A tuple with [hasLabels, LabelsComponent]
 */
export function createAvailabilityLabels(
  configs: AvailabilityLabelConfig[],
  options: {
    /** Maximum number of labels to show (default: show all) */
    maxLabels?: number;
    /** Sort labels by priority (default: true) */
    sortByPriority?: boolean;
  } = {},
): [boolean, FC] {
  const { maxLabels, sortByPriority = true } = options;

  // Filter the active labels based on conditions
  let activeLabels = configs.filter((config) => config.condition);

  // Sort by priority if enabled (higher numbers come first)
  if (sortByPriority) {
    activeLabels = activeLabels.sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    );
  }

  // Limit the number of labels if maxLabels is set
  if (maxLabels !== undefined && activeLabels.length > maxLabels) {
    activeLabels = activeLabels.slice(0, maxLabels);
  }

  const hasLabels = activeLabels.length > 0;

  // Create the component that will render the labels
  const AvailabilityLabels: FC = () => {
    if (!hasLabels) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {activeLabels.map((label) => (
          // `badgeText` is the user-facing label and is unique across the
          // preset configurations defined below (e.g. "In custody", "Checked
          // out", etc.), so it serves as a stable identity for this badge.
          <AvailabilityBadge
            key={label.badgeText}
            badgeText={label.badgeText}
            tooltipTitle={label.tooltipTitle}
            tooltipContent={label.tooltipContent}
            className={label.className}
          />
        ))}
      </div>
    );
  };

  return [hasLabels, AvailabilityLabels];
}

/**
 * Predefined label configurations for common asset states.
 *
 * Each preset takes the caller's `t` as its first argument: these are plain
 * factory functions living at module scope, so they cannot call
 * `useTranslation` themselves — the hook stays at the component call site.
 */
export const assetLabelPresets = {
  inCustody: (
    t: TFunction,
    isInCustody: boolean = false,
  ): AvailabilityLabelConfig => ({
    condition: isInCustody,
    badgeText: t("availability.inCustodyBadge"),
    tooltipTitle: t("scanAvailability.assetInCustodyTitle"),
    tooltipContent: t("scanAvailability.assetInCustodyContent"),
    priority: 100,
  }),

  checkedOut: (
    t: TFunction,
    isCheckedOut: boolean = false,
  ): AvailabilityLabelConfig => ({
    condition: isCheckedOut,
    badgeText: t("scanAvailability.checkedOut"),
    tooltipTitle: t("scanAvailability.assetCheckedOutTitle"),
    tooltipContent: t("scanAvailability.assetCheckedOutContent"),
    priority: 90,
  }),

  unavailable: (
    t: TFunction,
    isUnavailable: boolean = false,
  ): AvailabilityLabelConfig => ({
    condition: isUnavailable,
    badgeText: t("availability.unavailableBadge"),
    tooltipTitle: t("scanAvailability.assetUnavailableTitle"),
    tooltipContent: t("scanAvailability.assetUnavailableContent"),
    priority: 110,
  }),
};
