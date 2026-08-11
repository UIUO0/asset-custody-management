/**
 * Reports Module — Type Definitions
 *
 * Defines the data contracts for the reports system. These types are used by:
 * - Report loaders (server-side data fetching)
 * - Report components (client-side rendering)
 * - Report registry (configuration)
 *
 * @see {@link file://./registry.ts}
 * @see {@link file://./helpers.server.ts}
 */

import type { AssetType, Currency } from "@prisma/client";

// -----------------------------------------------------------------------------
// KPI Types
// -----------------------------------------------------------------------------

/** Format hints for KPI value display */
export type KpiFormat = "number" | "currency" | "percent" | "duration";

/**
 * A single KPI card's data. Pre-aggregated by the loader — components never
 * compute these from row arrays.
 */
export interface ReportKpi {
  /** Unique identifier for the KPI within this report */
  id: string;
  /** Human-readable label (e.g., "Completed on time") */
  label: string;
  /** The main value (already formatted as string for display flexibility) */
  value: string;
  /** Raw numeric value for sorting/comparison (optional) */
  rawValue?: number;
  /** Format hint for the value */
  format: KpiFormat;
  /** Period-over-period delta (e.g., "+12%", "-5") — null if not applicable */
  delta?: string | null;
  /** Whether delta is positive, negative, or neutral */
  deltaType?: "positive" | "negative" | "neutral";
  /** Label for the comparison period (e.g., "vs prior 30d") */
  deltaPeriodLabel?: string;
  /** Optional link destination when KPI is clicked */
  href?: string;
  /** Optional description for tooltips or additional context */
  description?: string;
}

// -----------------------------------------------------------------------------
// Timeframe Types
// -----------------------------------------------------------------------------

/** Preset timeframe options */
export type TimeframePreset =
  | "today"
  | "last_7d"
  | "last_30d"
  | "last_90d"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "all_time"
  | "custom";

/**
 * Resolved timeframe with actual dates. Used by loaders to query data.
 */
export interface ResolvedTimeframe {
  preset: TimeframePreset;
  from: Date;
  to: Date;
  /** Human-readable label (e.g., "Last 30 days", "Jan 1 - Jan 31") */
  label: string;
}

// -----------------------------------------------------------------------------
// Filter Types
// -----------------------------------------------------------------------------

/** Filter types supported by reports */
export type FilterType =
  | "status"
  | "location"
  | "category"
  | "team_member"
  | "asset"
  | "booking";

/** A single filter value */
export interface ReportFilter {
  type: FilterType;
  value: string;
  label: string;
}

/** Active filters for a report */
export interface ReportFilters {
  timeframe: ResolvedTimeframe;
  filters: ReportFilter[];
}

// -----------------------------------------------------------------------------
// Chart Types
// -----------------------------------------------------------------------------

/** A single data point for time-series charts */
export interface ChartDataPoint {
  /** ISO date string or formatted label */
  date: string;
  /** The primary metric value */
  value: number;
  /** Optional secondary metric value (for comparison) */
  compareValue?: number;
  /** Optional label for the data point */
  label?: string;
}

/** Series configuration for charts */
export interface ChartSeries {
  id: string;
  name: string;
  data: ChartDataPoint[];
  color?: string;
}

// -----------------------------------------------------------------------------
// Report Payload Types
// -----------------------------------------------------------------------------

/**
 * Standard loader response shape for all reports. Every report loader returns
 * this structure; specific reports extend `rows` with their own row type.
 */
export interface ReportPayload<TRow = Record<string, unknown>> {
  /** Report metadata */
  report: {
    id: string;
    title: string;
    description: string;
  };
  /** Applied filters (echoed back for URL state sync) */
  filters: ReportFilters;
  /** Pre-aggregated KPIs — never compute these client-side */
  kpis: ReportKpi[];
  /** Table rows */
  rows: TRow[];
  /** Optional chart data */
  chartSeries?: ChartSeries[];
  /** Query execution time in milliseconds (for debugging) */
  computedMs: number;
  /** Total row count before pagination (for "showing X of Y") */
  totalRows: number;
  /** Current page (1-indexed) */
  page: number;
  /** Rows per page */
  pageSize: number;
}

// -----------------------------------------------------------------------------
// R4: Idle Assets Report Types
// -----------------------------------------------------------------------------

/** Row type for the Idle Assets report */
export interface IdleAssetRow {
  id: string;
  assetId: string;
  assetName: string;
  /** Asset thumbnail image URL */
  thumbnailImage: string | null;
  category: string | null;
  location: string | null;
  /** Date of last booking checkout, null if never booked */
  /** Days since last activity */
  daysSinceLastUse: number;
  /** Current asset status */
  status: string;
  /** Per-unit valuation if set. The displayed "Value" column shows the
   * TOTAL (valuation × quantity) for QT assets; see {@link CurrencyCell}. */
  valuation: number | null;
  /** Asset kind — drives the quantity-aware value breakdown in cells. */
  type: AssetType;
  /** Total stock count; >1 only for QT assets. Nullable to match
   * Prisma's `Asset.quantity` shape; consumers treat `null` as 1
   * (see `getAssetTotalValue` in `~/utils/asset-value`). */
  quantity: number | null;
  /** Optional unit label (e.g. "boxes") used by the value breakdown. */
  unitOfMeasure: string | null;
}

/** KPI IDs for the Idle Assets report */
export type IdleAssetsKpiId =
  | "total_idle"
  | "idle_percentage"
  | "total_idle_value"
  | "avg_days_idle";

// -----------------------------------------------------------------------------
// R5: Custody Snapshot Report Types
// -----------------------------------------------------------------------------

/** Row type for the Custody Snapshot report */
export interface CustodySnapshotRow {
  id: string;
  assetId: string;
  assetName: string;
  /** Asset thumbnail image URL */
  thumbnailImage: string | null;
  category: string | null;
  location: string | null;
  custodianId: string;
  custodianName: string;
  /** When custody was assigned */
  assignedAt: Date;
  /** Days in custody */
  daysInCustody: number;
  /** Per-unit valuation if set. The displayed "Value" column shows the
   * TOTAL (valuation × quantity-in-custody) for QT; see {@link CurrencyCell}. */
  valuation: number | null;
  /** Asset kind — drives the quantity-aware value breakdown in cells. */
  type: AssetType;
  /** **Units held in this custody** (`Custody.quantity`), NOT workspace
   * stock. Drives the per-row Value cell multiplier — a custodian holding
   * 5 of a 100-unit QT pool reports value-for-5, not 100. Typed as
   * `number | null` for `CurrencyCell` compatibility; `Custody.quantity`
   * is non-null at the DB layer (Int @default(1)). */
  quantity: number | null;
  /** Optional unit label (e.g. "boxes") used by the value breakdown. */
  unitOfMeasure: string | null;
}

/** KPI IDs for the Custody Snapshot report */
export type CustodySnapshotKpiId =
  | "total_in_custody"
  | "total_custodians"
  | "total_custody_value"
  | "avg_days_in_custody";

// -----------------------------------------------------------------------------
// R10: Asset Distribution Report Types
// -----------------------------------------------------------------------------

/** Row type for the Asset Distribution report (by category) */
export interface AssetDistributionRow {
  id: string;
  /** Group name (category, location, or status) */
  groupName: string;
  /** Number of assets in this group */
  assetCount: number;
  /** Percentage of total assets */
  percentage: number;
  /** Total value of assets in this group */
  totalValue: number | null;
}

/** Distribution breakdown data */
export interface DistributionBreakdown {
  /** Breakdown by category */
  byCategory: AssetDistributionRow[];
  /** Breakdown by location */
  byLocation: AssetDistributionRow[];
  /** Breakdown by status */
  byStatus: AssetDistributionRow[];
}

/** KPI IDs for the Asset Distribution report */
export type AssetDistributionKpiId =
  | "total_assets"
  | "total_value"
  | "total_categories"
  | "total_locations";

// -----------------------------------------------------------------------------
// R1: Asset Inventory Report Types
// -----------------------------------------------------------------------------

/** Row type for the Asset Inventory report */
export interface AssetInventoryRow {
  id: string;
  assetId: string;
  assetName: string;
  /** Asset thumbnail image URL */
  thumbnailImage: string | null;
  category: string | null;
  location: string | null;
  status: string;
  custodian: string | null;
  /** Per-unit valuation if set. The displayed "Value" column shows the
   * TOTAL (valuation × quantity) for QT assets; see {@link CurrencyCell}. */
  valuation: number | null;
  /** Asset kind — drives the quantity-aware value breakdown in cells. */
  type: AssetType;
  /** Total stock count; >1 only for QT assets. Nullable to match
   * Prisma's `Asset.quantity` shape; consumers treat `null` as 1
   * (see `getAssetTotalValue` in `~/utils/asset-value`). */
  quantity: number | null;
  /** Optional unit label (e.g. "boxes") used by the value breakdown. */
  unitOfMeasure: string | null;
  /** Date asset was created */
  createdAt: Date;
  /** QR code ID if assigned */
  qrId: string | null;
}

/** KPI IDs for the Asset Inventory report */
export type AssetInventoryKpiId =
  | "total_assets"
  | "total_value"
  | "available_count"
  | "in_custody_count";

// -----------------------------------------------------------------------------
// R7: Asset Activity Summary Report Types
// -----------------------------------------------------------------------------

/** Activity type for asset activity report */
export type AssetActivityType =
  | "CREATED"
  | "UPDATED"
  | "CUSTODY_ASSIGNED"
  | "CUSTODY_RELEASED"
  | "BOOKING_CHECKED_OUT"
  | "BOOKING_CHECKED_IN"
  | "LOCATION_CHANGED"
  | "CATEGORY_CHANGED";

/** Row type for the Asset Activity Summary report */
export interface AssetActivityRow {
  id: string;
  assetId: string;
  assetName: string;
  /** Asset thumbnail image URL */
  thumbnailImage: string | null;
  /** Type of activity */
  activityType: AssetActivityType;
  /** Human-readable description */
  description: string;
  /** When the activity occurred */
  occurredAt: Date;
  /** User who performed the action (if applicable) */
  performedBy: string | null;
  /** Additional context (e.g., booking name, custodian name) */
  context: string | null;
}

/** KPI IDs for the Asset Activity Summary report */
export type AssetActivityKpiId =
  | "total_activities"
  | "custody_changes"
  | "booking_activities"
  | "most_active_asset";

// -----------------------------------------------------------------------------
// PDF Export Types
// -----------------------------------------------------------------------------

/** Base fields common to all report PDFs */
export interface ReportPdfMetaBase {
  reportId: string;
  reportTitle: string;
  reportDescription: string;
  organizationName: string;
  organizationImageId: string | null;
  organizationUpdatedAt: Date;
  generatedAt: string;
  totalCount: number;
  /**
   * ISO 4217 currency code of the workspace whose data the PDF is rendering.
   * Used by the PDF renderer to format monetary values via `formatCurrency`.
   */
  currency: Currency;
  /**
   * BCP 47 locale tag (e.g. `"en-GB"`, `"fr-FR"`) resolved from the request's
   * client hints. Drives currency + number formatting in the PDF.
   */
  locale: string;
}

/** Data structure for asset inventory report PDF */
export interface AssetInventoryPdfMeta extends ReportPdfMetaBase {
  reportId: "asset-inventory";
  totalValuation: number;
  statusBreakdown: {
    available: number;
    inCustody: number;
    checkedOut: number;
  };
  rows: Array<{
    assetId: string;
    assetName: string;
    status: string;
    category: string | null;
    location: string | null;
    custodian: string | null;
    valuation: number | null;
    qrId: string | null;
  }>;
}

/** Data structure for custody snapshot report PDF */
export interface CustodySnapshotPdfMeta extends ReportPdfMetaBase {
  reportId: "custody-snapshot";
  totalAssetsInCustody: number;
  totalCustodians: number;
  totalValuation: number;
  rows: Array<{
    assetId: string;
    assetName: string;
    category: string | null;
    location: string | null;
    custodianName: string;
    assignedAt: string;
    daysInCustody: number;
    valuation: number | null;
  }>;
}

/** Union type for all report PDF metadata */
export type ReportPdfMeta = AssetInventoryPdfMeta | CustodySnapshotPdfMeta;

// -----------------------------------------------------------------------------
// Report Definition Types
// -----------------------------------------------------------------------------

/** Supported filter types for a report */
export type ReportFilterConfig = {
  type: FilterType;
  label: string;
  multi?: boolean;
};

/**
 * Report definition in the registry. Describes a report's metadata and
 * capabilities without containing any runtime logic.
 */
export interface ReportDefinition {
  /** Unique report identifier (URL-safe slug) */
  id: string;
  /** Human-readable title */
  title: string;
  /** Short description shown in the reports index */
  description: string;
  /** Category for grouping in the index */
  category: "bookings" | "assets" | "custody" | "audits" | "overview";
  /** Icon name from Lucide */
  icon: string;
  /** Whether the report is available (false = "Coming soon") */
  enabled: boolean;
  /** Supported filters */
  filters: ReportFilterConfig[];
  /** Whether the report includes charts */
  hasChart: boolean;
  /** Whether CSV export is available */
  exportable: boolean;
  /** Required permission action (defaults to "read") */
  requiredAction?: "read" | "export";
}
