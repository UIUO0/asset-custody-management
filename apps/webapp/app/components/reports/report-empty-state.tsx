/**
 * Report Empty State Component
 *
 * Displayed when a report has no data for the selected timeframe/filters.
 * Matches the app's existing empty state patterns.
 *
 * @see {@link file://../../components/list/empty-state.tsx}
 * @see {@link file://../../components/dashboard/empty-state.tsx}
 */

import { useTranslation } from "react-i18next";
import { Button } from "~/components/shared/button";
import { tw } from "~/utils/tw";

export type ReportEmptyReason = "no_data" | "no_results" | "error";

export interface ReportEmptyStateProps {
  /** Why the report is empty */
  reason?: ReportEmptyReason;
  /** Custom title (overrides default) */
  title?: string;
  /** Custom description (overrides default) */
  description?: string;
  /** Primary CTA link (e.g., "/bookings/new") */
  ctaTo?: string;
  /** Primary CTA label (e.g., "Create a booking") */
  ctaLabel?: string;
  /** Action to clear filters */
  onClearFilters?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Default title/description per empty reason.
 *
 * Values are **i18n keys** — this record is module-scope, so the strings are
 * resolved with `t()` inside {@link ReportEmptyState}.
 */
const CONTENT: Record<
  ReportEmptyReason,
  { titleKey: string; descriptionKey: string }
> = {
  no_data: {
    titleKey: "reports.emptyNoActivityYet",
    descriptionKey: "reports.emptyNoActivityYetBody",
  },
  no_results: {
    titleKey: "reports.emptyNoMatches",
    descriptionKey: "reports.emptyNoMatchesBody",
  },
  error: {
    titleKey: "reports.emptyLoadFailed",
    descriptionKey: "reports.emptyLoadFailedBody",
  },
};

/**
 * Empty state for reports with no data.
 *
 * Uses the app's standard empty state illustration and styling patterns
 * for visual consistency across the application.
 */
export function ReportEmptyState({
  reason = "no_data",
  title,
  description,
  ctaTo,
  ctaLabel,
  onClearFilters,
  className,
}: ReportEmptyStateProps) {
  const { t } = useTranslation();
  const content = CONTENT[reason];

  return (
    <div
      className={tw(
        "flex flex-col items-center justify-center gap-8 px-4 py-[100px] text-center",
        className,
      )}
    >
      {/* Empty state illustration - matches app pattern */}
      <img
        src="/static/images/empty-state.svg"
        alt=""
        aria-hidden="true"
        className="h-auto w-[172px]"
      />

      <div className="flex flex-col gap-2">
        {/* Title */}
        <div className="text-lg font-semibold text-gray-900">
          {title || t(content.titleKey)}
        </div>

        {/* Description */}
        <p className="text-gray-600">
          {description || t(content.descriptionKey)}
        </p>
      </div>

      {/* Actions */}
      {(ctaTo || onClearFilters) && (
        <div className="flex items-center gap-3">
          {ctaTo && (
            <Button to={ctaTo} variant="primary">
              {ctaLabel || t("reports.getStarted")}
            </Button>
          )}
          {onClearFilters && (
            <Button type="button" variant="secondary" onClick={onClearFilters}>
              {t("reports.clearFilters")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default ReportEmptyState;
