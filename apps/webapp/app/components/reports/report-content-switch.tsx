/**
 * @file Report content dispatcher.
 *
 * Routes the loader's payload to the right per-report Content component
 * based on `reportId`. Also owns the empty-state branch so the route
 * page doesn't have to know about it.
 *
 * This is the seam where the route-loaded payload (loosely typed via
 * `ReportPayload<any>` upstream) gets cast to the per-report row type
 * each Content component expects. The casts mirror what the original
 * inline switch in the route did before the extraction.
 *
 * @see {@link file://./../../routes/_layout+/reports.$reportId.tsx}
 */

import { useTranslation } from "react-i18next";
import type {
  AssetActivityRow,
  AssetInventoryRow,
  AssetUtilizationRow,
  BookingComplianceRow,
  ChartSeries,
  ComplianceData,
  CustodySnapshotRow,
  DistributionBreakdown,
  IdleAssetRow,
  MonthlyBookingTrendRow,
  OverdueItemRow,
  ReportKpi,
  ResolvedTimeframe,
  TopBookedAssetRow,
  TopBookedKitRow,
} from "~/modules/reports/types";

import { AssetActivityContent } from "./asset-activity-content";
import { AssetDistributionContent } from "./asset-distribution-content";
import { AssetInventoryContent } from "./asset-inventory-content";
import { AssetUtilizationContent } from "./asset-utilization-content";
import { BookingComplianceContent } from "./booking-compliance-content";
import { CustodySnapshotContent } from "./custody-snapshot-content";
import { IdleAssetsContent } from "./idle-assets-content";
import { MonthlyBookingTrendsContent } from "./monthly-booking-trends-content";
import { OverdueItemsContent } from "./overdue-items-content";
import { ReportEmptyState } from "./report-empty-state";
import { TopBookedAssetsContent } from "./top-booked-assets-content";
import { TopBookedKitsContent } from "./top-booked-kits-content";
import type { ReportRowHandlers } from "./use-report-row-handlers";

/** Props for {@link ReportContentSwitch}. */
type Props = {
  /** Active report id; drives which Content component renders. */
  reportId: string;
  /** Page slice of rows for this report (typed loosely; cast per
   *  branch to the report's row type). */
  rows: unknown[];
  /** KPI cards aggregated for the page. */
  kpis: ReportKpi[];
  /** Total row count across all pages (display in tables). */
  totalRows: number;
  /** Resolved timeframe — used by some Content components for the
   *  hero label. */
  timeframe: ResolvedTimeframe;
  /** Booking-compliance-only payload extra. */
  complianceData?: ComplianceData;
  /** Top-booked-assets-only payload extra (the singular #1 asset). */
  topBookedAsset?: TopBookedAssetRow | null;
  /** Top-booked-kits-only payload extra (the singular #1 kit). */
  topBookedKit?: TopBookedKitRow | null;
  /** Distribution-only payload extra. */
  distributionBreakdown?: DistributionBreakdown;
  /** Monthly-booking-trends-only payload extra. */
  chartSeries?: ChartSeries[];
  /** Stable row-click handlers from `useReportRowHandlers`. */
  handlers: ReportRowHandlers;
};

/**
 * Renders the right Content component for `reportId`, or an empty
 * state when there are no rows.
 */
export function ReportContentSwitch({
  reportId,
  rows,
  kpis,
  totalRows,
  timeframe,
  complianceData,
  topBookedAsset,
  topBookedKit,
  distributionBreakdown,
  chartSeries,
  handlers,
}: Props) {
  const { t } = useTranslation();
  // Distribution is the one report with no row table — it's purely
  // donut-driven, so `hasData` is meaningless there. Always render it
  // and let `AssetDistributionContent` handle its own empty state.
  if (reportId === "distribution") {
    return (
      <AssetDistributionContent
        kpis={kpis}
        distributionBreakdown={distributionBreakdown}
      />
    );
  }

  // Every other report falls back to a shared empty state when no
  // rows came back.
  if (rows.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-white">
        <ReportEmptyState
          reason="no_data"
          title={t(getEmptyStateTitle(reportId))}
          description={t(getEmptyStateDescription(reportId))}
          ctaTo={getEmptyStateCta(reportId)?.to}
          ctaLabel={getEmptyStateCta(reportId)?.label}
        />
      </div>
    );
  }

  switch (reportId) {
    case "booking-compliance":
      return (
        <BookingComplianceContent
          rows={rows as BookingComplianceRow[]}
          complianceData={complianceData}
          totalBookings={totalRows}
          timeframeLabel={timeframe.label}
          onRowClick={handlers.onBookingRowClick}
        />
      );

    case "overdue-items":
      return (
        <OverdueItemsContent
          rows={rows as OverdueItemRow[]}
          kpis={kpis}
          totalRows={totalRows}
          onRowClick={handlers.onBookingRowClick}
        />
      );

    case "idle-assets":
      return (
        <IdleAssetsContent
          rows={rows as IdleAssetRow[]}
          kpis={kpis}
          totalRows={totalRows}
          timeframeLabel={timeframe.label}
          onRowClick={handlers.onAssetRowClick}
        />
      );

    case "custody-snapshot":
      return (
        <CustodySnapshotContent
          rows={rows as CustodySnapshotRow[]}
          kpis={kpis}
          totalRows={totalRows}
          onRowClick={handlers.onAssetRowClick}
        />
      );

    case "top-booked-assets":
      return (
        <TopBookedAssetsContent
          rows={rows as TopBookedAssetRow[]}
          kpis={kpis}
          totalRows={totalRows}
          timeframeLabel={timeframe.label}
          topBookedAsset={topBookedAsset}
          onRowClick={handlers.onAssetRowClick}
        />
      );

    case "top-booked-kits":
      return (
        <TopBookedKitsContent
          rows={rows as TopBookedKitRow[]}
          kpis={kpis}
          totalRows={totalRows}
          timeframeLabel={timeframe.label}
          topBookedKit={topBookedKit}
          onRowClick={handlers.onKitRowClick}
        />
      );

    case "asset-inventory":
      return (
        <AssetInventoryContent
          rows={rows as AssetInventoryRow[]}
          kpis={kpis}
          totalRows={totalRows}
          onRowClick={handlers.onAssetRowClick}
        />
      );

    case "monthly-booking-trends":
      return (
        <MonthlyBookingTrendsContent
          rows={rows as MonthlyBookingTrendRow[]}
          kpis={kpis}
          totalRows={totalRows}
          chartSeries={chartSeries}
        />
      );

    case "asset-utilization":
      return (
        <AssetUtilizationContent
          rows={rows as AssetUtilizationRow[]}
          kpis={kpis}
          totalRows={totalRows}
          onRowClick={handlers.onAssetRowClick}
        />
      );

    case "asset-activity":
      return (
        <AssetActivityContent
          rows={rows as AssetActivityRow[]}
          kpis={kpis}
          totalRows={totalRows}
          onRowClick={handlers.onAssetRowClick}
        />
      );

    default:
      return (
        <ReportEmptyState
          reason="error"
          title={t("reports.notImplemented")}
          description={t("reports.notImplementedBody")}
        />
      );
  }
}

// -----------------------------------------------------------------------------
// Empty-state copy
//
// Reports are analytics views, not action prompts. The primary guidance
// should help users find data (expand timeframe, adjust filters), not
// necessarily create new data.
// -----------------------------------------------------------------------------

/**
 * Empty-state heading for a report.
 *
 * Returns an **i18n key**, not copy — this helper is module-scope and the
 * caller (a component) resolves it with `t()`.
 */
function getEmptyStateTitle(reportId: string): string {
  switch (reportId) {
    case "booking-compliance":
      return "reports.noBookingsToAnalyze";
    case "overdue-items":
      return "reports.noOverdueBookings";
    case "idle-assets":
      return "reports.noIdleAssets";
    case "custody-snapshot":
      return "reports.noAssetsInCustody";
    case "top-booked-assets":
      return "reports.noBookingActivity";
    case "top-booked-kits":
      return "reports.noKitBookingActivity";
    case "distribution":
      return "reports.noAssets";
    case "asset-inventory":
      return "reports.noAssetsInInventory";
    case "monthly-booking-trends":
      return "reports.noBookingData";
    case "asset-utilization":
      return "reports.noUtilizationData";
    case "asset-activity":
      return "reports.noActivityRecorded";
    default:
      return "reports.noDataInTimeframe";
  }
}

/**
 * Empty-state body copy for a report. Returns an **i18n key** — see
 * {@link getEmptyStateTitle}.
 */
function getEmptyStateDescription(reportId: string): string {
  switch (reportId) {
    case "booking-compliance":
      // This is an analytics report - focus on finding data, not creating it.
      // The report analyzes check-out/check-in compliance for bookings that
      // fall within the selected timeframe.
      return "reports.noBookingsToAnalyzeBody";
    case "overdue-items":
      return "reports.noOverdueBookingsBody";
    case "idle-assets":
      return "reports.noIdleAssetsBody";
    case "custody-snapshot":
      return "reports.noAssetsInCustodyBody";
    case "top-booked-assets":
      return "reports.noBookingActivityBody";
    case "top-booked-kits":
      return "reports.noKitBookingActivityBody";
    case "distribution":
      return "reports.noDistributionBody";
    case "asset-inventory":
      return "reports.noAssetsInInventoryBody";
    case "monthly-booking-trends":
      return "reports.noBookingDataBody";
    case "asset-utilization":
      return "reports.noUtilizationDataBody";
    case "asset-activity":
      return "reports.noActivityRecordedBody";
    default:
      return "reports.noDataInTimeframeBody";
  }
}

/**
 * Returns a CTA for the empty state, if appropriate. For analytics
 * reports we intentionally return `null` because "create new data"
 * isn't the right action when viewing reports — the user came here
 * to analyze, not to create.
 */
function getEmptyStateCta(
  _reportId: string,
): { to: string; label: string } | null {
  // For now, no reports have a CTA in their empty state.
  // The appropriate action is to adjust the timeframe, which is
  // already available via the TimeframePicker above.
  return null;
}
