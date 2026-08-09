/**
 * Reports Helpers — Server-Side Data Fetching
 *
 * Report-specific data fetching functions. Each report has a dedicated helper
 * that returns a `ReportPayload` with pre-aggregated KPIs, table rows, and
 * optional chart series.
 *
 * These helpers call into the activity-event reports module for event-driven
 * data and query operational tables directly for current-state snapshots.
 *
 * @see {@link file://./types.ts}
 * @see {@link file://../activity-event/reports.server.ts}
 */

import type { ActivityAction, AssetStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { db } from "~/database/db.server";
import { getAssetTotalValue } from "~/utils/asset-value";
import { ShelfError } from "~/utils/error";

import type {
  AssetActivityRow,
  AssetActivityType,
  AssetDistributionRow,
  AssetInventoryRow,
  CustodySnapshotRow,
  DistributionBreakdown,
  IdleAssetRow,
  ReportKpi,
  ReportPayload,
  ResolvedTimeframe,
} from "./types";
import { refreshExpiredAssetImages } from "../asset/service.server";
import { getPrimaryLocation } from "../asset/utils";

// Re-export timeframe utilities for server use
export { resolveTimeframe } from "./timeframe";

// -----------------------------------------------------------------------------
// Name Formatting
// -----------------------------------------------------------------------------

/**
 * Strip role suffixes from display names.
 * Removes "(Owner)" which is a role indicator added for display, not part of the actual name.
 */
function stripNameSuffix(name: string | null | undefined): string {
  if (!name) return "Unknown";
  return name.replace(/\s*\(Owner\)$/i, "").trim() || "Unknown";
}

// -----------------------------------------------------------------------------
// R4: Idle Assets Report
// -----------------------------------------------------------------------------

interface IdleAssetsArgs {
  organizationId: string;
  /** Number of days without activity to consider "idle" (default: 30) */
  idleThresholdDays?: number;
  categoryId?: string;
  locationId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Generate the Idle Assets report (R4).
 *
 * Identifies assets that haven't been booked or checked out recently.
 * Helps with inventory optimization and identifying underutilized assets.
 *
 * @param args - Report parameters
 * @returns Complete report payload
 */
export async function idleAssetsReport(
  args: IdleAssetsArgs,
): Promise<ReportPayload<IdleAssetRow>> {
  const {
    organizationId,
    idleThresholdDays = 30,
    categoryId,
    locationId,
    page = 1,
    pageSize = 50,
  } = args;

  const startTime = performance.now();

  try {
    // Calculate the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - idleThresholdDays);

    // Build asset where clause
    const assetWhere: Prisma.AssetWhereInput = {
      organizationId,
    };

    if (categoryId) {
      assetWhere.categoryId = categoryId;
    }

    if (locationId) {
      assetWhere.assetLocations = { some: { locationId } };
    }

    // Fetch data — `fetchIdleAssetRows` re-signs any expired thumbnail URLs
    // inline (see its body) so we don't need a separate refresh round-trip.
    const [rows, totalCount, kpis] = await Promise.all([
      fetchIdleAssetRows(
        organizationId,
        assetWhere,
        cutoffDate,
        page,
        pageSize,
      ),
      countIdleAssets(organizationId, assetWhere, cutoffDate),
      computeIdleAssetsKpis(organizationId, assetWhere, cutoffDate),
    ]);

    const computedMs = Math.round(performance.now() - startTime);

    // Create timeframe for display
    const now = new Date();
    const timeframe: ResolvedTimeframe = {
      preset: "last_30d",
      from: cutoffDate,
      to: now,
      label: `Idle for ${idleThresholdDays}+ days`,
    };

    return {
      report: {
        id: "idle-assets",
        title: "Idle Assets",
        description:
          "Find assets that haven't been booked or checked out recently.",
      },
      filters: {
        timeframe,
        filters: [],
      },
      kpis,
      rows,
      computedMs,
      totalRows: totalCount,
      page,
      pageSize,
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      label: "Report",
      message: "Failed to generate Idle Assets report",
      additionalData: { organizationId, idleThresholdDays },
    });
  }
}

/**
 * Fetch idle asset rows with last booking date.
 *
 * An asset is considered idle if it hasn't been part of any booking
 * that was checked out since the cutoff date.
 */
async function fetchIdleAssetRows(
  organizationId: string,
  assetWhere: Prisma.AssetWhereInput,
  cutoffDate: Date,
  page: number,
  pageSize: number,
): Promise<IdleAssetRow[]> {
  const now = new Date();

  // Get assets with their last booking checkout. Phase 3a: walk the
  // `BookingAsset` pivot for both the exclusion filter and the
  // most-recent-completed sub-query. `organizationId` is enforced
  // explicitly here for defense-in-depth alongside the caller's
  // `assetWhere`. `mainImage`, `mainImageExpiration`, `organizationId`
  // are selected so we can pipe the assets through
  // `refreshExpiredAssetImages` below without an extra round-trip.
  const assets = await db.asset.findMany({
    where: {
      ...assetWhere,
      organizationId,
      NOT: {
        bookingAssets: {
          some: {
            booking: {
              status: { in: ["ONGOING", "OVERDUE"] },
            },
          },
        },
      },
    },
    // Least recently updated first; `id` tiebreaker keeps skip/take paging
    // deterministic for assets sharing an `updatedAt` (bulk operations).
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      organizationId: true,
      title: true,
      mainImage: true,
      mainImageExpiration: true,
      thumbnailImage: true,
      status: true,
      valuation: true,
      type: true,
      quantity: true,
      unitOfMeasure: true,
      updatedAt: true,
      category: {
        select: {
          name: true,
        },
      },
      assetLocations: {
        select: {
          location: {
            select: {
              name: true,
            },
          },
        },
      },
      // Pull the most-recent COMPLETE booking via the pivot. We sort
      // pivot rows by their related booking's `to` desc and take the
      // first one to find the last completed booking for this asset.
      bookingAssets: {
        where: {
          booking: { status: "COMPLETE" },
        },
        orderBy: { booking: { to: "desc" } },
        take: 1,
        select: {
          booking: { select: { to: true } },
        },
      },
    },
  });

  // Filter to only include assets that are actually idle (no recent booking)
  const idleAssets = assets.filter((asset) => {
    const lastBookingEnd = asset.bookingAssets[0]?.booking.to;
    if (!lastBookingEnd) return true; // Never booked = idle
    return lastBookingEnd < cutoffDate;
  });

  // Re-sign expired thumbnail signed URLs in place. No-op when URLs are
  // still fresh (the helper checks `mainImageExpiration > now` first).
  const refreshedAssets = await refreshExpiredAssetImages(idleAssets);

  return refreshedAssets.map((asset) => {
    const lastBookedAt = asset.bookingAssets[0]?.booking.to || null;
    const daysSinceLastUse = lastBookedAt
      ? Math.ceil(
          (now.getTime() - lastBookedAt.getTime()) / (1000 * 60 * 60 * 24),
        )
      : Math.ceil(
          (now.getTime() - asset.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
        );

    return {
      id: asset.id,
      assetId: asset.id,
      assetName: asset.title,
      thumbnailImage: asset.thumbnailImage,
      category: asset.category?.name || null,
      location: getPrimaryLocation(asset)?.name || null,
      lastBookedAt,
      daysSinceLastUse,
      status: asset.status,
      valuation: asset.valuation,
      type: asset.type,
      quantity: asset.quantity,
      unitOfMeasure: asset.unitOfMeasure,
    };
  });
}

/**
 * Count total idle assets matching the criteria.
 */
async function countIdleAssets(
  organizationId: string,
  assetWhere: Prisma.AssetWhereInput,
  cutoffDate: Date,
): Promise<number> {
  // Get all potentially idle assets — Phase 3a: walk the BookingAsset
  // pivot for both the exclusion filter and the most-recent-completed
  // sub-query. `organizationId` is enforced explicitly as a
  // defense-in-depth guard alongside the caller-supplied `assetWhere`.
  const assets = await db.asset.findMany({
    where: {
      ...assetWhere,
      organizationId,
      NOT: {
        bookingAssets: {
          some: {
            booking: {
              status: { in: ["ONGOING", "OVERDUE"] },
            },
          },
        },
      },
    },
    select: {
      id: true,
      bookingAssets: {
        where: {
          booking: { status: "COMPLETE" },
        },
        orderBy: { booking: { to: "desc" } },
        take: 1,
        select: {
          booking: { select: { to: true } },
        },
      },
    },
  });

  // Filter to only truly idle assets
  return assets.filter((asset) => {
    const lastBookingEnd = asset.bookingAssets[0]?.booking.to;
    if (!lastBookingEnd) return true;
    return lastBookingEnd < cutoffDate;
  }).length;
}

async function computeIdleAssetsKpis(
  organizationId: string,
  assetWhere: Prisma.AssetWhereInput,
  cutoffDate: Date,
): Promise<ReportKpi[]> {
  const now = new Date();

  // Get total asset count for percentage
  const totalAssets = await db.asset.count({
    where: {
      organizationId,
    },
  });

  // Get idle assets with details — Phase 3a: walk the BookingAsset
  // pivot for both the exclusion filter and the most-recent-completed
  // sub-query. Org scoping is enforced explicitly here so the helper is
  // safe even if `assetWhere` ever loses its organizationId clause.
  const idleAssets = await db.asset.findMany({
    where: {
      ...assetWhere,
      organizationId,
      NOT: {
        bookingAssets: {
          some: {
            booking: {
              status: { in: ["ONGOING", "OVERDUE"] },
            },
          },
        },
      },
    },
    select: {
      id: true,
      valuation: true,
      // `quantity` is selected so `totalIdleValue` below can compute
      // valuation × quantity (QT-aware totals).
      quantity: true,
      updatedAt: true,
      bookingAssets: {
        where: {
          booking: { status: "COMPLETE" },
        },
        orderBy: { booking: { to: "desc" } },
        take: 1,
        select: {
          booking: { select: { to: true } },
        },
      },
    },
  });

  // Filter to truly idle and calculate metrics
  const trulyIdle = idleAssets.filter((asset) => {
    const lastBookingEnd = asset.bookingAssets[0]?.booking.to;
    if (!lastBookingEnd) return true;
    return lastBookingEnd < cutoffDate;
  });

  const totalIdle = trulyIdle.length;
  const idlePercentage =
    totalAssets > 0 ? Math.round((totalIdle / totalAssets) * 100) : 0;

  // QT-aware: multiplies valuation × quantity so qty-tracked assets are not silently underreported.
  const totalIdleValue = trulyIdle.reduce(
    (sum, asset) => sum + getAssetTotalValue(asset),
    0,
  );

  // Calculate average days idle
  const daysIdleList = trulyIdle.map((asset) => {
    const lastBookedAt = asset.bookingAssets[0]?.booking.to;
    if (!lastBookedAt) {
      return Math.ceil(
        (now.getTime() - asset.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    return Math.ceil(
      (now.getTime() - lastBookedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
  });

  const avgDaysIdle =
    daysIdleList.length > 0
      ? Math.round(
          daysIdleList.reduce((a, b) => a + b, 0) / daysIdleList.length,
        )
      : 0;

  return [
    {
      id: "total_idle",
      label: "Idle Assets",
      value: totalIdle.toLocaleString(),
      rawValue: totalIdle,
      format: "number",
      delta: null,
      deltaType:
        totalIdle > 10 ? "negative" : totalIdle > 0 ? "neutral" : "positive",
    },
    {
      id: "idle_percentage",
      label: "% of Inventory",
      value: `${idlePercentage}%`,
      rawValue: idlePercentage,
      format: "percent",
      delta: null,
      deltaType:
        idlePercentage > 20
          ? "negative"
          : idlePercentage > 10
          ? "neutral"
          : "positive",
    },
    {
      id: "total_idle_value",
      label: "Idle Value",
      value: totalIdleValue > 0 ? `$${totalIdleValue.toLocaleString()}` : "—",
      rawValue: totalIdleValue,
      format: "currency",
      delta: null,
      deltaType:
        totalIdleValue > 10000
          ? "negative"
          : totalIdleValue > 0
          ? "neutral"
          : "positive",
    },
    {
      id: "avg_days_idle",
      label: "Avg. Days Idle",
      value: avgDaysIdle > 0 ? `${avgDaysIdle} days` : "—",
      rawValue: avgDaysIdle,
      format: "number",
      delta: null,
      deltaType:
        avgDaysIdle > 60
          ? "negative"
          : avgDaysIdle > 30
          ? "neutral"
          : "positive",
    },
  ];
}

// -----------------------------------------------------------------------------
// R5: Custody Snapshot Report
// -----------------------------------------------------------------------------

interface CustodySnapshotArgs {
  organizationId: string;
  teamMemberId?: string;
  locationId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Generate the Custody Snapshot report (R5).
 *
 * Live view of all assets currently in custody.
 * Answers: "Who has what right now?"
 *
 * @param args - Report parameters
 * @returns Complete report payload
 */
export async function custodySnapshotReport(
  args: CustodySnapshotArgs,
): Promise<ReportPayload<CustodySnapshotRow>> {
  const {
    organizationId,
    teamMemberId,
    locationId,
    page = 1,
    pageSize = 50,
  } = args;

  const startTime = performance.now();

  try {
    // Build where clause for custody records. Location filtering operates on
    // the underlying asset; the `"without-location"` sentinel mirrors the
    // Simple-mode Assets index convention for "no location set".
    const assetWhere: Prisma.AssetWhereInput = { organizationId };
    // Placement lives on the AssetLocation pivot — an asset can occupy
    // multiple locations. "without-location" means no pivot rows at all;
    // a concrete id means at least one pivot row points at it.
    if (locationId === "without-location") {
      assetWhere.assetLocations = { none: {} };
    } else if (locationId) {
      assetWhere.assetLocations = { some: { locationId } };
    }

    const where: Prisma.CustodyWhereInput = {
      asset: assetWhere,
    };

    if (teamMemberId) {
      where.teamMemberId = teamMemberId;
    }

    // Fetch data in parallel — `fetchCustodyRows` re-signs expired thumbnail
    // URLs inline (see its body); no separate refresh round-trip.
    const [rows, totalCount, kpis] = await Promise.all([
      fetchCustodyRows(where, page, pageSize),
      db.custody.count({ where }),
      computeCustodyKpis(organizationId, where),
    ]);

    const computedMs = Math.round(performance.now() - startTime);

    // Create a "now" timeframe for display
    const now = new Date();
    const timeframe: ResolvedTimeframe = {
      preset: "today",
      from: now,
      to: now,
      label: "Current",
    };

    return {
      report: {
        id: "custody-snapshot",
        title: "Custody Snapshot",
        description:
          "Live view of all assets currently in custody and their assigned team members.",
      },
      filters: {
        timeframe,
        filters: [],
      },
      kpis,
      rows,
      computedMs,
      totalRows: totalCount,
      page,
      pageSize,
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      label: "Report",
      message: "Failed to generate Custody Snapshot report",
      additionalData: { organizationId },
    });
  }
}

async function fetchCustodyRows(
  where: Prisma.CustodyWhereInput,
  page: number,
  pageSize: number,
): Promise<CustodySnapshotRow[]> {
  const now = new Date();

  // The nested asset select includes `mainImage`, `mainImageExpiration`,
  // and `organizationId` so we can pipe the assets through
  // `refreshExpiredAssetImages` below without an extra round-trip.
  const custodyRecords = await db.custody.findMany({
    where,
    // `id` tiebreaker keeps skip/take paging deterministic for rows sharing
    // a `createdAt` (bulk operations land in the same millisecond).
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      createdAt: true,
      // `Custody.quantity` = units this custodian actually holds (not
      // workspace stock). Drives the row's value breakdown — a custodian
      // holding 5 of a 100-unit pool should see value-for-5, not 100.
      quantity: true,
      custodian: {
        select: {
          id: true,
          name: true,
        },
      },
      asset: {
        select: {
          id: true,
          organizationId: true,
          title: true,
          mainImage: true,
          mainImageExpiration: true,
          thumbnailImage: true,
          valuation: true,
          type: true,
          unitOfMeasure: true,
          category: {
            select: { name: true },
          },
          assetLocations: {
            select: {
              location: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
  });

  // Refresh expired thumbnail signed URLs in place, then look up the fresh
  // URL by asset id when building rows. No-op when URLs are still fresh.
  // Custody records are unique per asset-currently-held, but we dedupe
  // defensively in case a row appears more than once.
  const uniqueAssets = Array.from(
    new Map(custodyRecords.map((c) => [c.asset.id, c.asset])).values(),
  );
  const refreshedAssets = await refreshExpiredAssetImages(uniqueAssets);
  const refreshedThumbnailByAssetId = new Map(
    refreshedAssets.map((a) => [a.id, a.thumbnailImage]),
  );

  return custodyRecords.map((c) => {
    const assignedAt = c.createdAt;
    const daysInCustody = Math.ceil(
      (now.getTime() - assignedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      id: c.id,
      assetId: c.asset.id,
      assetName: c.asset.title,
      thumbnailImage:
        refreshedThumbnailByAssetId.get(c.asset.id) ?? c.asset.thumbnailImage,
      category: c.asset.category?.name || null,
      location: getPrimaryLocation(c.asset)?.name || null,
      custodianId: c.custodian.id,
      custodianName: stripNameSuffix(c.custodian.name),
      assignedAt,
      daysInCustody,
      valuation: c.asset.valuation,
      type: c.asset.type,
      // Surfaced as the multiplier for the per-row Value cell — units
      // in this custody, not asset stock. See select comment above.
      quantity: c.quantity,
      unitOfMeasure: c.asset.unitOfMeasure,
    };
  });
}

async function computeCustodyKpis(
  organizationId: string,
  baseWhere: Prisma.CustodyWhereInput,
): Promise<ReportKpi[]> {
  const now = new Date();

  // Fetch custody data for KPIs. `Custody` has no direct organizationId
  // column, so we scope through the related asset as a defense-in-depth
  // guard alongside the caller-supplied `baseWhere`.
  const custodyRecords = await db.custody.findMany({
    where: { ...baseWhere, asset: { organizationId } },
    select: {
      createdAt: true,
      teamMemberId: true,
      // `Custody.quantity` = units held by this custodian. Multiplied
      // against per-unit valuation below — using `Asset.quantity` (total
      // stock) would value a 5-of-100 custody at 100 units.
      quantity: true,
      asset: {
        select: {
          valuation: true,
        },
      },
    },
  });

  const totalInCustody = custodyRecords.length;

  // Count unique custodians
  const uniqueCustodians = new Set(custodyRecords.map((c) => c.teamMemberId))
    .size;

  // Multiplies per-unit valuation × custody-held units. See select above.
  const totalValue = custodyRecords.reduce(
    (sum, c) => sum + (c.asset.valuation ?? 0) * c.quantity,
    0,
  );

  // Calculate average days in custody
  const daysInCustodyList = custodyRecords.map((c) =>
    Math.ceil((now.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const avgDaysInCustody =
    daysInCustodyList.length > 0
      ? Math.round(
          daysInCustodyList.reduce((a, b) => a + b, 0) /
            daysInCustodyList.length,
        )
      : 0;

  return [
    {
      id: "total_in_custody",
      label: "Assets in Custody",
      value: totalInCustody.toLocaleString(),
      rawValue: totalInCustody,
      format: "number",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "total_custodians",
      label: "Team Members",
      value: uniqueCustodians.toLocaleString(),
      rawValue: uniqueCustodians,
      format: "number",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "total_custody_value",
      label: "Total Value",
      value: totalValue > 0 ? `$${totalValue.toLocaleString()}` : "—",
      rawValue: totalValue,
      format: "currency",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "avg_days_in_custody",
      label: "Avg. Days Held",
      value: avgDaysInCustody > 0 ? `${avgDaysInCustody} days` : "—",
      rawValue: avgDaysInCustody,
      format: "number",
      delta: null,
      deltaType: avgDaysInCustody > 30 ? "neutral" : "positive",
    },
  ];
}

// -----------------------------------------------------------------------------
// R10: Asset Distribution Report
// -----------------------------------------------------------------------------

interface AssetDistributionArgs {
  organizationId: string;
  page?: number;
  pageSize?: number;
}

/**
 * Generate the Asset Distribution report (R10).
 *
 * Breakdown of assets by category, location, and status.
 * Answers: "How is my inventory distributed?"
 *
 * @param args - Report parameters
 * @returns Complete report payload with distribution breakdowns
 */
export async function assetDistributionReport(
  args: AssetDistributionArgs,
): Promise<
  ReportPayload<AssetDistributionRow> & {
    distributionBreakdown: DistributionBreakdown;
  }
> {
  const { organizationId, page = 1, pageSize = 50 } = args;

  const startTime = performance.now();

  try {
    // Fetch all distribution data in parallel.
    const [byCategory, byLocation, byStatus, kpis] = await Promise.all([
      computeDistributionByCategory(organizationId),
      computeDistributionByLocation(organizationId),
      computeDistributionByStatus(organizationId),
      computeDistributionKpis(organizationId),
    ]);

    const computedMs = Math.round(performance.now() - startTime);

    // Create a "now" timeframe for display
    const now = new Date();
    const timeframe: ResolvedTimeframe = {
      preset: "today",
      from: now,
      to: now,
      label: "Current",
    };

    // Use category breakdown as the main rows (most useful for table view)
    // Note: byCategory is already sorted by assetCount descending
    const rows = byCategory.slice((page - 1) * pageSize, page * pageSize);

    return {
      report: {
        id: "distribution",
        title: "Asset Distribution",
        description:
          "Breakdown of assets by category, location, and status for inventory planning.",
      },
      filters: {
        timeframe,
        filters: [],
      },
      kpis,
      rows,
      distributionBreakdown: {
        byCategory,
        byLocation,
        byStatus,
      },
      computedMs,
      totalRows: byCategory.length, // Count of category rows, not total assets
      page,
      pageSize,
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      label: "Report",
      message: "Failed to generate Asset Distribution report",
      additionalData: { organizationId },
    });
  }
}

async function computeDistributionByCategory(
  organizationId: string,
): Promise<AssetDistributionRow[]> {
  const assets = await db.asset.groupBy({
    by: ["categoryId"],
    where: { organizationId },
    _count: { id: true },
    _sum: { valuation: true },
  });

  const totalAssets = assets.reduce((sum, a) => sum + a._count.id, 0);

  // Fetch category names
  const categoryIds = assets
    .map((a) => a.categoryId)
    .filter((id): id is string => id !== null);

  const categories = await db.category.findMany({
    where: { id: { in: categoryIds }, organizationId },
    select: { id: true, name: true },
  });

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  return assets
    .map((a) => ({
      id: a.categoryId || "uncategorized",
      groupName: a.categoryId
        ? categoryMap.get(a.categoryId) || "Unknown"
        : "Uncategorized",
      assetCount: a._count.id,
      percentage:
        totalAssets > 0 ? Math.round((a._count.id / totalAssets) * 100) : 0,
      totalValue: a._sum.valuation,
    }))
    .sort((a, b) => b.assetCount - a.assetCount);
}

async function computeDistributionByLocation(
  organizationId: string,
): Promise<AssetDistributionRow[]> {
  // Pull every asset with its AssetLocation pivot rows (+ location name)
  // so we can bucket each asset under each location it occupies. A
  // QUANTITY_TRACKED asset can span multiple locations, so it may
  // contribute to several buckets; assets with no pivot rows fall into
  // "No Location".
  const assets = await db.asset.findMany({
    where: { organizationId },
    select: {
      id: true,
      valuation: true,
      assetLocations: {
        select: {
          location: { select: { id: true, name: true } },
        },
      },
    },
  });

  // bucketKey → { name, assetCount, totalValue }. Counts are per
  // (asset, location) pair to mirror the previous groupBy semantics.
  const buckets = new Map<
    string,
    { name: string; assetCount: number; totalValue: number | null }
  >();

  const addToBucket = (key: string, name: string, valuation: number | null) => {
    const existing = buckets.get(key);
    if (existing) {
      existing.assetCount += 1;
      existing.totalValue =
        valuation === null
          ? existing.totalValue
          : (existing.totalValue ?? 0) + valuation;
    } else {
      buckets.set(key, {
        name,
        assetCount: 1,
        totalValue: valuation,
      });
    }
  };

  for (const asset of assets) {
    if (asset.assetLocations.length === 0) {
      addToBucket("without-location", "No Location", asset.valuation);
      continue;
    }
    for (const pivot of asset.assetLocations) {
      addToBucket(pivot.location.id, pivot.location.name, asset.valuation);
    }
  }

  const totalAssets = Array.from(buckets.values()).reduce(
    (sum, b) => sum + b.assetCount,
    0,
  );

  return Array.from(buckets.entries())
    .map(([id, b]) => ({
      id,
      groupName: b.name,
      assetCount: b.assetCount,
      percentage:
        totalAssets > 0 ? Math.round((b.assetCount / totalAssets) * 100) : 0,
      totalValue: b.totalValue,
    }))
    .sort((a, b) => b.assetCount - a.assetCount);
}

async function computeDistributionByStatus(
  organizationId: string,
): Promise<AssetDistributionRow[]> {
  const assets = await db.asset.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { id: true },
    _sum: { valuation: true },
  });

  const totalAssets = assets.reduce((sum, a) => sum + a._count.id, 0);

  const statusLabels: Record<string, string> = {
    AVAILABLE: "Available",
    IN_CUSTODY: "In Custody",
    CHECKED_OUT: "Checked Out",
  };

  return assets
    .map((a) => ({
      id: a.status,
      groupName: statusLabels[a.status] || a.status,
      assetCount: a._count.id,
      percentage:
        totalAssets > 0 ? Math.round((a._count.id / totalAssets) * 100) : 0,
      totalValue: a._sum.valuation,
    }))
    .sort((a, b) => b.assetCount - a.assetCount);
}

async function computeDistributionKpis(
  organizationId: string,
): Promise<ReportKpi[]> {
  const [totalAssets, totalValueRows, categoryCount, locationCount] =
    await Promise.all([
      db.asset.count({ where: { organizationId } }),
      // QT-aware: multiplies value × quantity so qty-tracked assets are not silently underreported.
      // Prisma's `aggregate({_sum})` cannot express the multiplication, so we drop to `$queryRaw`.
      // Column name is `value` (Asset.valuation is `@map("value")`). COALESCE
      // mirrors `getAssetTotalValue` (null quantity → 1, null value → 0).
      // No `::bigint` cast — it truncated fractional Float valuations.
      db.$queryRaw<{ total: number | null }[]>(
        Prisma.sql`
          SELECT COALESCE(SUM(COALESCE(value, 0) * COALESCE(quantity, 1)), 0) AS total
          FROM "Asset"
          WHERE "organizationId" = ${organizationId}
        `,
      ),
      db.category.count({ where: { organizationId } }),
      db.location.count({ where: { organizationId } }),
    ]);

  const totalAssetValue = Number(totalValueRows[0]?.total ?? 0);

  return [
    {
      id: "total_assets",
      label: "Total Assets",
      value: totalAssets.toLocaleString(),
      rawValue: totalAssets,
      format: "number",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "total_value",
      label: "Total Value",
      value: totalAssetValue > 0 ? `$${totalAssetValue.toLocaleString()}` : "—",
      rawValue: totalAssetValue,
      format: "currency",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "total_categories",
      label: "Categories",
      value: categoryCount.toLocaleString(),
      rawValue: categoryCount,
      format: "number",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "total_locations",
      label: "Locations",
      value: locationCount.toLocaleString(),
      rawValue: locationCount,
      format: "number",
      delta: null,
      deltaType: "neutral",
    },
  ];
}

// =============================================================================
// R1: Asset Inventory Report
// =============================================================================

interface AssetInventoryArgs {
  organizationId: string;
  categoryIds?: string[];
  locationIds?: string[];
  statuses?: string[];
  page?: number;
  pageSize?: number;
}

/**
 * Generate the Asset Inventory report (R1).
 *
 * Complete snapshot of all assets with filtering and export capabilities.
 *
 * @param args - Report parameters
 * @returns Complete report payload
 */
export async function assetInventoryReport(
  args: AssetInventoryArgs,
): Promise<ReportPayload<AssetInventoryRow>> {
  const {
    organizationId,
    categoryIds,
    locationIds,
    statuses,
    page = 1,
    pageSize = 50,
  } = args;

  const startTime = performance.now();

  try {
    // Build where clause
    const where: Prisma.AssetWhereInput = { organizationId };

    if (categoryIds && categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    }
    if (locationIds && locationIds.length > 0) {
      where.assetLocations = { some: { locationId: { in: locationIds } } };
    }
    if (statuses && statuses.length > 0) {
      where.status = { in: statuses as AssetStatus[] };
    }

    // Fetch data in parallel — `fetchInventoryRows` re-signs expired
    // thumbnail URLs inline (see its body); no separate refresh round-trip.
    const [rows, totalCount, kpis] = await Promise.all([
      fetchInventoryRows(where, page, pageSize),
      db.asset.count({ where }),
      // Filters are passed through so the KPI helper can mirror them in its
      // `$queryRaw` valuation sum (Prisma doesn't expose where → SQL).
      computeInventoryKpis(organizationId, where, {
        categoryIds,
        locationIds,
        statuses: statuses as AssetStatus[] | undefined,
      }),
    ]);

    const computedMs = Math.round(performance.now() - startTime);

    // Create a "now" timeframe for display
    const now = new Date();
    const timeframe: ResolvedTimeframe = {
      preset: "today",
      from: now,
      to: now,
      label: "Current Inventory",
    };

    return {
      report: {
        id: "asset-inventory",
        title: "Asset Inventory",
        description: "Complete snapshot of your asset inventory.",
      },
      filters: {
        timeframe,
        filters: [],
      },
      kpis,
      rows,
      computedMs,
      totalRows: totalCount,
      page,
      pageSize,
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      label: "Report",
      message: "Failed to generate Asset Inventory report",
      additionalData: { organizationId },
    });
  }
}

async function fetchInventoryRows(
  where: Prisma.AssetWhereInput,
  page: number,
  pageSize: number,
): Promise<AssetInventoryRow[]> {
  // `mainImage`, `mainImageExpiration`, `organizationId` are selected so we
  // can pipe assets through `refreshExpiredAssetImages` below without an
  // extra round-trip.
  const assets = await db.asset.findMany({
    where,
    // `id` tiebreaker keeps skip/take paging deterministic for rows sharing
    // a `createdAt` (bulk operations land in the same millisecond).
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      organizationId: true,
      title: true,
      mainImage: true,
      mainImageExpiration: true,
      thumbnailImage: true,
      status: true,
      valuation: true,
      type: true,
      quantity: true,
      unitOfMeasure: true,
      createdAt: true,
      category: { select: { name: true } },
      assetLocations: {
        select: {
          location: { select: { name: true } },
        },
      },
      custody: {
        select: {
          custodian: { select: { name: true } },
        },
      },
      qrCodes: {
        take: 1,
        select: { id: true },
      },
    },
  });

  // Re-sign expired thumbnail signed URLs in place. No-op when fresh.
  const refreshedAssets = await refreshExpiredAssetImages(assets);

  return refreshedAssets.map((a) => ({
    id: a.id,
    assetId: a.id,
    assetName: a.title,
    thumbnailImage: a.thumbnailImage,
    category: a.category?.name || null,
    location: getPrimaryLocation(a)?.name || null,
    status: a.status,
    // Phase 2 turned `Asset.custody` into a `Custody[]` array, so we
    // pick the first row (assets with no custody resolve to `null`
    // through the optional chain).
    custodian: a.custody[0]?.custodian?.name
      ? stripNameSuffix(a.custody[0].custodian.name)
      : null,
    valuation: a.valuation,
    type: a.type,
    quantity: a.quantity,
    unitOfMeasure: a.unitOfMeasure,
    createdAt: a.createdAt,
    qrId: a.qrCodes[0]?.id || null,
  }));
}

async function computeInventoryKpis(
  organizationId: string,
  where: Prisma.AssetWhereInput,
  filters: {
    categoryIds?: string[];
    locationIds?: string[];
    statuses?: AssetStatus[];
  },
): Promise<ReportKpi[]> {
  // Defense-in-depth: enforce organizationId on every query even though
  // callers' `where` already includes it. Cheap to add, prevents an
  // accidental cross-org leak if the where-builder ever regresses.
  const scopedWhere: Prisma.AssetWhereInput = { ...where, organizationId };

  // QT-aware: multiplies valuation × quantity so qty-tracked assets are not silently underreported.
  // Prisma's `aggregate({_sum})` cannot express the multiplication, so we drop
  // to `$queryRaw` and mirror the same filters (organizationId + the optional
  // category / location / status filters) the Prisma `where` carries.
  const filterFragments: Prisma.Sql[] = [
    Prisma.sql`"organizationId" = ${organizationId}`,
  ];
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    filterFragments.push(
      Prisma.sql`"categoryId" IN (${Prisma.join(filters.categoryIds)})`,
    );
  }
  if (filters.locationIds && filters.locationIds.length > 0) {
    filterFragments.push(
      Prisma.sql`id IN (SELECT "assetId" FROM "AssetLocation" WHERE "locationId" IN (${Prisma.join(
        filters.locationIds,
      )}))`,
    );
  }
  if (filters.statuses && filters.statuses.length > 0) {
    filterFragments.push(
      Prisma.sql`status::text IN (${Prisma.join(filters.statuses)})`,
    );
  }
  const whereSql = Prisma.join(filterFragments, " AND ");

  const [totalAssets, totalValueRows, statusCounts] = await Promise.all([
    db.asset.count({ where: scopedWhere }),
    // Column is `value` (Asset.valuation is `@map("value")`). COALESCE
    // mirrors `getAssetTotalValue`. No `::bigint` cast — truncated floats.
    db.$queryRaw<{ total: number | null }[]>(
      Prisma.sql`
        SELECT COALESCE(SUM(COALESCE(value, 0) * COALESCE(quantity, 1)), 0) AS total
        FROM "Asset"
        WHERE ${whereSql}
      `,
    ),
    db.asset.groupBy({
      by: ["status"],
      where: scopedWhere,
      _count: { id: true },
    }),
  ]);

  const availableCount =
    statusCounts.find((s) => s.status === "AVAILABLE")?._count.id || 0;
  const inCustodyCount =
    statusCounts.find((s) => s.status === "IN_CUSTODY")?._count.id || 0;
  const totalAssetValue = Number(totalValueRows[0]?.total ?? 0);

  return [
    {
      id: "total_assets",
      label: "Total Assets",
      value: totalAssets.toLocaleString(),
      rawValue: totalAssets,
      format: "number",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "total_value",
      label: "Total Value",
      value: totalAssetValue > 0 ? `$${totalAssetValue.toLocaleString()}` : "—",
      rawValue: totalAssetValue,
      format: "currency",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "available_count",
      label: "Available",
      value: availableCount.toLocaleString(),
      rawValue: availableCount,
      format: "number",
      delta: null,
      deltaType: "neutral",
    },
    {
      id: "in_custody_count",
      label: "In Custody",
      value: inCustodyCount.toLocaleString(),
      rawValue: inCustodyCount,
      format: "number",
      delta: null,
      deltaType: "neutral",
    },
  ];
}

// =============================================================================
// R7: Asset Activity Summary Report
// =============================================================================

interface AssetActivityArgs {
  organizationId: string;
  timeframe: ResolvedTimeframe;
  assetId?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Generate the Asset Activity Summary report (R7).
 *
 * Comprehensive activity history for assets including notes and custody changes.
 *
 * @param args - Report parameters
 * @returns Complete report payload
 */
export async function assetActivityReport(
  args: AssetActivityArgs,
): Promise<ReportPayload<AssetActivityRow>> {
  const {
    organizationId,
    timeframe,
    assetId,
    categoryId,
    page = 1,
    pageSize = 50,
  } = args;

  const startTime = performance.now();

  try {
    // Asset-related actions we care about
    const assetActions: ActivityAction[] = [
      "ASSET_CREATED",
      "ASSET_NAME_CHANGED",
      "ASSET_DESCRIPTION_CHANGED",
      "ASSET_CATEGORY_CHANGED",
      "ASSET_LOCATION_CHANGED",
      "ASSET_STATUS_CHANGED",
      "ASSET_VALUATION_CHANGED",
      "ASSET_TAGS_CHANGED",
      "ASSET_CUSTOM_FIELD_CHANGED",
      "CUSTODY_ASSIGNED",
      "CUSTODY_RELEASED",
      "BOOKING_CHECKED_OUT",
      "BOOKING_CHECKED_IN",
    ];

    // Build where clause for ActivityEvent
    const where: Prisma.ActivityEventWhereInput = {
      organizationId,
      occurredAt: { gte: timeframe.from, lte: timeframe.to },
      action: { in: assetActions },
      assetId: assetId ? assetId : { not: null },
    };

    // If filtering by category, get asset IDs first
    let assetIdsInCategory: string[] | undefined;
    if (categoryId) {
      const assetsInCategory = await db.asset.findMany({
        where: { organizationId, categoryId },
        select: { id: true },
      });
      assetIdsInCategory = assetsInCategory.map((a) => a.id);
      where.assetId = { in: assetIdsInCategory };
    }

    // Fetch activity events
    const [events, totalCount] = await Promise.all([
      db.activityEvent.findMany({
        where,
        // `id` tiebreaker keeps skip/take paging deterministic for events
        // sharing an `occurredAt` (bulk mutations emit same-instant events).
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.activityEvent.count({ where }),
    ]);

    // Get asset details for the events. `mainImage`, `mainImageExpiration`,
    // `organizationId` are selected so we can pipe assets through
    // `refreshExpiredAssetImages` below without an extra round-trip.
    const assetIds = [
      ...new Set(events.map((e) => e.assetId).filter(Boolean)),
    ] as string[];
    const assets = await db.asset.findMany({
      where: { id: { in: assetIds }, organizationId },
      select: {
        id: true,
        organizationId: true,
        title: true,
        mainImage: true,
        mainImageExpiration: true,
        thumbnailImage: true,
      },
    });
    const refreshedAssets = await refreshExpiredAssetImages(assets);
    const assetMap = new Map(refreshedAssets.map((a) => [a.id, a]));

    // Map events to rows
    const rows: AssetActivityRow[] = events.map((event) => {
      const asset = event.assetId ? assetMap.get(event.assetId) : null;
      const actorSnapshot = event.actorSnapshot as {
        firstName?: string;
        lastName?: string;
        displayName?: string;
      } | null;

      return {
        id: event.id,
        assetId: event.assetId || "",
        assetName: asset?.title || "Unknown Asset",
        thumbnailImage: asset?.thumbnailImage || null,
        activityType: mapActionToActivityType(event.action),
        description: buildActivityDescription(event),
        occurredAt: event.occurredAt,
        performedBy: actorSnapshot
          ? stripNameSuffix(
              actorSnapshot.displayName ||
                `${actorSnapshot.firstName || ""} ${
                  actorSnapshot.lastName || ""
                }`.trim(),
            )
          : null,
        context: null,
      };
    });

    // Calculate KPIs from ALL events (not just current page)
    const allEventsForKpis = await db.activityEvent.groupBy({
      by: ["action"],
      where,
      _count: { id: true },
    });

    const actionCounts = new Map(
      allEventsForKpis.map((g) => [g.action, g._count.id]),
    );

    const custodyChanges =
      (actionCounts.get("CUSTODY_ASSIGNED") || 0) +
      (actionCounts.get("CUSTODY_RELEASED") || 0);
    const bookingActivities =
      (actionCounts.get("BOOKING_CHECKED_OUT") || 0) +
      (actionCounts.get("BOOKING_CHECKED_IN") || 0);

    // Find most active asset
    const assetActivityCounts = await db.activityEvent.groupBy({
      by: ["assetId"],
      where,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    });

    let mostActiveName = "—";
    if (assetActivityCounts.length > 0 && assetActivityCounts[0].assetId) {
      const mostActiveAsset = await db.asset.findFirst({
        where: { id: assetActivityCounts[0].assetId, organizationId },
        select: { title: true },
      });
      mostActiveName = mostActiveAsset?.title || "—";
    }

    const kpis: ReportKpi[] = [
      {
        id: "total_activities",
        label: "Total Activities",
        value: totalCount.toLocaleString(),
        rawValue: totalCount,
        format: "number",
        delta: null,
        deltaType: "neutral",
      },
      {
        id: "custody_changes",
        label: "Custody Changes",
        value: custodyChanges.toLocaleString(),
        rawValue: custodyChanges,
        format: "number",
        delta: null,
        deltaType: "neutral",
      },
      {
        id: "booking_activities",
        label: "Booking Activities",
        value: bookingActivities.toLocaleString(),
        rawValue: bookingActivities,
        format: "number",
        delta: null,
        deltaType: "neutral",
      },
      {
        id: "most_active_asset",
        label: "Most Active",
        value: mostActiveName,
        rawValue: assetActivityCounts[0]?._count?.id || 0,
        format: "number",
        delta: null,
        deltaType: "neutral",
      },
    ];

    // Thumbnail URLs were already refreshed when we built `assetMap` above,
    // so the rows we just constructed have fresh URLs — no separate
    // refresh step needed here.
    const computedMs = Math.round(performance.now() - startTime);

    return {
      report: {
        id: "asset-activity",
        title: "Asset Activity Summary",
        description: "Comprehensive activity history for assets.",
      },
      filters: {
        timeframe,
        filters: [],
      },
      kpis,
      rows,
      computedMs,
      totalRows: totalCount,
      page,
      pageSize,
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      label: "Report",
      message: "Failed to generate Asset Activity Summary report",
      additionalData: { organizationId },
    });
  }
}

/** Map ActivityAction enum to the report's activity type */
function mapActionToActivityType(action: ActivityAction): AssetActivityType {
  switch (action) {
    case "ASSET_CREATED":
      return "CREATED";
    case "ASSET_CATEGORY_CHANGED":
      return "CATEGORY_CHANGED";
    case "ASSET_LOCATION_CHANGED":
      return "LOCATION_CHANGED";
    case "CUSTODY_ASSIGNED":
      return "CUSTODY_ASSIGNED";
    case "CUSTODY_RELEASED":
      return "CUSTODY_RELEASED";
    case "BOOKING_CHECKED_OUT":
      return "BOOKING_CHECKED_OUT";
    case "BOOKING_CHECKED_IN":
      return "BOOKING_CHECKED_IN";
    default:
      return "UPDATED";
  }
}

/** Build human-readable description from activity event */
function buildActivityDescription(event: {
  action: ActivityAction;
  field?: string | null;
  fromValue?: unknown;
  toValue?: unknown;
}): string {
  const actionLabels: Record<string, string> = {
    ASSET_CREATED: "Asset created",
    ASSET_NAME_CHANGED: "Name changed",
    ASSET_DESCRIPTION_CHANGED: "Description updated",
    ASSET_CATEGORY_CHANGED: "Category changed",
    ASSET_LOCATION_CHANGED: "Location changed",
    ASSET_STATUS_CHANGED: "Status changed",
    ASSET_VALUATION_CHANGED: "Valuation changed",
    ASSET_TAGS_CHANGED: "Tags updated",
    ASSET_CUSTOM_FIELD_CHANGED: "Custom field updated",
    CUSTODY_ASSIGNED: "Custody assigned",
    CUSTODY_RELEASED: "Custody released",
    BOOKING_CHECKED_OUT: "Checked out",
    BOOKING_CHECKED_IN: "Checked in",
  };

  const label =
    actionLabels[event.action] || event.action.replace(/_/g, " ").toLowerCase();

  // Add from/to values for change events
  if (
    event.field &&
    event.fromValue !== undefined &&
    event.toValue !== undefined
  ) {
    const from = formatFieldValue(event.fromValue);
    const to = formatFieldValue(event.toValue);
    if (from && to) {
      return `${label}: ${from} → ${to}`;
    }
  }

  return label;
}

/** Format a field value for display */
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
}
