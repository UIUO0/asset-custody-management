/**
 * Report CSV Export Route
 *
 * Generates a CSV file for the requested report with current filters.
 * Follows the same pattern as assets.export.$fileName[.csv].tsx.
 *
 * @see {@link file://../../modules/reports/helpers.server.ts}
 */

import { data, type LoaderFunctionArgs } from "react-router";

import {
  readAssetActivityFilters,
  readAssetInventoryFilters,
  readCustodySnapshotFilters,
  readIdleAssetsFilters,
} from "~/modules/reports/filters";
import {
  custodySnapshotReport,
  idleAssetsReport,
  assetInventoryReport,
  assetActivityReport,
  assetDistributionReport,
} from "~/modules/reports/helpers.server";
import { getReportById } from "~/modules/reports/registry";
import type {
  CustodySnapshotRow,
  IdleAssetRow,
  AssetInventoryRow,
  AssetActivityRow,
  DistributionBreakdown,
} from "~/modules/reports/types";
import { makeShelfError, ShelfError } from "~/utils/error";
import { error, getCurrentSearchParams } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const loader = async ({
  context,
  request,
  params,
}: LoaderFunctionArgs) => {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.export,
    });

    const searchParams = getCurrentSearchParams(request);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      throw new ShelfError({
        cause: null,
        message: "Report ID is required for export",
        label: "Report",
        status: 400,
      });
    }

    // Validate report exists and supports export
    const reportDef = getReportById(reportId);
    if (!reportDef) {
      throw new ShelfError({
        cause: null,
        message: `Report "${reportId}" not found`,
        label: "Report",
        status: 404,
      });
    }

    if (!reportDef.exportable) {
      throw new ShelfError({
        cause: null,
        message: `Report "${reportDef.title}" does not support export`,
        label: "Report",
        status: 403,
      });
    }

    /**
     * Exports take the whole result set, not a page of it.
     *
     * That is the one thing the screen and the exports legitimately disagree
     * about, which is why paging is not part of the shared filter readers —
     * every *filter* below now comes from `modules/reports/filters.ts`, the
     * same source the screen reads.
     */
    const paging = { page: 1, pageSize: 10000 };

    // Generate CSV based on report type
    let csvString: string;

    switch (reportId) {
      case "custody-snapshot": {
        const reportData = await custodySnapshotReport({
          organizationId,
          ...readCustodySnapshotFilters(searchParams),
          ...paging,
        });
        csvString = generateCustodySnapshotCsv(
          reportData.rows as CustodySnapshotRow[],
        );
        break;
      }

      case "idle-assets": {
        const reportData = await idleAssetsReport({
          organizationId,
          ...readIdleAssetsFilters(searchParams),
          ...paging,
        });
        csvString = generateIdleAssetsCsv(reportData.rows as IdleAssetRow[]);
        break;
      }

      case "asset-inventory": {
        const reportData = await assetInventoryReport({
          organizationId,
          ...readAssetInventoryFilters(searchParams),
          ...paging,
        });
        csvString = generateAssetInventoryCsv(
          reportData.rows as AssetInventoryRow[],
        );
        break;
      }

      case "asset-activity": {
        const reportData = await assetActivityReport({
          organizationId,
          ...readAssetActivityFilters(searchParams),
          ...paging,
        });
        csvString = generateAssetActivityCsv(
          reportData.rows as AssetActivityRow[],
        );
        break;
      }

      case "distribution": {
        // Takes no filters — it summarises the whole workspace.
        const reportData = await assetDistributionReport({
          organizationId,
          ...paging,
        });
        csvString = generateDistributionCsv(reportData.distributionBreakdown);
        break;
      }

      default:
        throw new ShelfError({
          cause: null,
          message: `Export not implemented for report "${reportId}"`,
          label: "Report",
          status: 500,
        });
    }

    // Get filename from URL params (e.g., "booking-compliance-last_30d-2026-04-22")
    const fileName = params.fileName || `${reportId}-export`;

    return new Response(csvString, {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-disposition": `attachment; filename="${fileName}.csv"`,
        "cache-control": "no-cache",
      },
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
};

/**
 * Generate CSV for Custody Snapshot report.
 */
function generateCustodySnapshotCsv(rows: CustodySnapshotRow[]): string {
  const headers = [
    "Asset ID",
    "Asset Name",
    "Category",
    "Location",
    "Assigned To",
    "Assigned Date",
    "Days Held",
    "Valuation",
  ];

  const csvRows = rows.map((row) => [
    row.assetId,
    escapeCsvField(row.assetName),
    row.category || "",
    row.location || "",
    row.custodianName,
    formatDateForCsv(row.assignedAt),
    row.daysInCustody.toString(),
    row.valuation?.toString() || "",
  ]);

  return [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\n");
}

/**
 * Escape a field for CSV format.
 */
function escapeCsvField(field: string): string {
  // Neutralize spreadsheet formula injection (CWE-1236): a value starting with
  // =, +, -, or @ can execute as a formula in Excel/Google Sheets. Prefix such
  // values with a single quote so the cell is treated as literal text. Applied
  // here in the shared helper so every report export is protected.
  const safeField = /^[=+\-@]/.test(field) ? `'${field}` : field;
  if (
    safeField.includes(",") ||
    safeField.includes('"') ||
    safeField.includes("\n")
  ) {
    return `"${safeField.replace(/"/g, '""')}"`;
  }
  return safeField;
}

/**
 * Format date for CSV export.
 */
function formatDateForCsv(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().split("T")[0];
}

/**
 * Generate CSV for Idle Assets report.
 */
function generateIdleAssetsCsv(rows: IdleAssetRow[]): string {
  const headers = [
    "Asset ID",
    "Asset Name",
    "Category",
    "Location",
    "Last Booked",
    "Days Idle",
    "Valuation",
  ];

  const csvRows = rows.map((row) => [
    row.assetId,
    escapeCsvField(row.assetName),
    row.category || "",
    row.location || "",
    row.lastBookedAt ? formatDateForCsv(row.lastBookedAt) : "Never",
    row.daysSinceLastUse.toString(),
    row.valuation?.toString() || "",
  ]);

  return [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\n");
}

/**
 * Generate CSV for Asset Inventory report.
 */
function generateAssetInventoryCsv(rows: AssetInventoryRow[]): string {
  const headers = [
    "Asset ID",
    "Asset Name",
    "Category",
    "Location",
    "Status",
    "Custodian",
    "Valuation",
    "Created Date",
    "QR Code ID",
  ];

  const csvRows = rows.map((row) => [
    row.assetId,
    escapeCsvField(row.assetName),
    row.category || "",
    row.location || "",
    formatAssetStatus(row.status),
    row.custodian || "",
    row.valuation?.toString() || "",
    formatDateForCsv(row.createdAt),
    row.qrId || "",
  ]);

  return [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\n");
}

/**
 * Generate CSV for Asset Activity report.
 */
function generateAssetActivityCsv(rows: AssetActivityRow[]): string {
  const headers = [
    "Date",
    "Asset ID",
    "Asset Name",
    "Activity Type",
    "Description",
    "Performed By",
  ];

  const csvRows = rows.map((row) => [
    formatDateForCsv(row.occurredAt),
    row.assetId,
    escapeCsvField(row.assetName),
    formatActivityType(row.activityType),
    escapeCsvField(row.description || ""),
    row.performedBy || "System",
  ]);

  return [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\n");
}

/**
 * Format asset status for CSV.
 * Labels match asset-status-badge.tsx for consistency.
 */
function formatAssetStatus(status: string): string {
  const labels: Record<string, string> = {
    AVAILABLE: "Available",
    IN_CUSTODY: "In custody",
    CHECKED_OUT: "Checked out",
  };
  return labels[status] || status;
}

/**
 * Format activity type for CSV.
 */
function formatActivityType(type: string): string {
  const labels: Record<string, string> = {
    CREATED: "Asset created",
    UPDATED: "Asset updated",
    CUSTODY_ASSIGNED: "Custody assigned",
    CUSTODY_RELEASED: "Custody released",
    BOOKING_CHECKED_OUT: "Checked out",
    BOOKING_CHECKED_IN: "Checked in",
    LOCATION_CHANGED: "Location changed",
    CATEGORY_CHANGED: "Category changed",
  };
  return labels[type] || type;
}

/**
 * Generate CSV for Asset Distribution report.
 *
 * Exports all three breakdowns (by category, location, and status) in a single CSV.
 * Each section is labeled with a "Breakdown Type" column for clarity.
 */
function generateDistributionCsv(breakdown: DistributionBreakdown): string {
  const headers = [
    "Breakdown Type",
    "Group",
    "Asset Count",
    "Percentage",
    "Total Valuation",
  ];

  const formatRows = (
    type: string,
    rows: DistributionBreakdown["byCategory"],
  ) =>
    rows.map((row) => [
      type,
      escapeCsvField(row.groupName),
      row.assetCount.toString(),
      `${row.percentage.toFixed(1)}%`,
      row.totalValue?.toString() || "",
    ]);

  const allRows = [
    ...formatRows("Category", breakdown.byCategory),
    ...formatRows("Location", breakdown.byLocation),
    ...formatRows("Status", breakdown.byStatus),
  ];

  return [headers.join(","), ...allRows.map((row) => row.join(","))].join("\n");
}
