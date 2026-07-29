/**
 * @file Idle threshold selector.
 *
 * Toggle button group used by the "Idle Assets" report to let users choose
 * the inactivity window that defines "idle": 30, 60, or 90 days. Renders
 * native `<button>` elements (not the shared `<Button>` component) so the
 * ESLint `local-rules/require-button-type` rule is satisfied via explicit
 * `type="button"` on each toggle.
 *
 * Extracted from the monolithic reports route during the
 * `reports.$reportId.tsx` decomposition. Pure presentational control —
 * the route owns URL state and re-fetching.
 *
 * @see {@link file://./../../routes/_layout+/reports.$reportId.tsx}
 */

import { useTranslation } from "react-i18next";
import { tw } from "~/utils/tw";

/** Props for {@link IdleThresholdSelector}. */
type Props = {
  /** Currently selected threshold in days (30, 60, or 90). */
  value: number;
  /** Called when the user picks a different threshold. */
  onChange: (days: number) => void;
  /** When true, all toggle buttons are disabled (e.g. while loading). */
  disabled?: boolean;
};

/**
 * Idle threshold selector for the Idle Assets report.
 * Allows users to define what "idle" means: 30, 60, or 90+ days of inactivity.
 */
export function IdleThresholdSelector({
  value,
  onChange,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const thresholds = [{ days: 30 }, { days: 60 }, { days: 90 }];

  return (
    <div className="flex items-center gap-3">
      <span id="idle-threshold-label" className="text-sm text-gray-600">
        {t("reports.unusedForLabel")}
      </span>
      <div
        role="group"
        aria-labelledby="idle-threshold-label"
        className="flex items-center gap-1 rounded border border-gray-200 bg-white p-1"
      >
        {thresholds.map((threshold) => (
          <button
            key={threshold.days}
            type="button"
            aria-pressed={value === threshold.days}
            onClick={() => onChange(threshold.days)}
            disabled={disabled}
            className={tw(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-50",
              value === threshold.days
                ? "bg-primary-600 text-static-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
            )}
          >
            {t("reports.daysCount", { count: threshold.days })}
          </button>
        ))}
      </div>
    </div>
  );
}
