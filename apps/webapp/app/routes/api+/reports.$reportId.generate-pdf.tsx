/**
 * Report PDF Data Route
 *
 * Fetches report data for client-side PDF generation.
 * Returns JSON that the client renders as a styled HTML preview,
 * then converts to PDF via react-to-print.
 *
 * @see {@link file://../../components/reports/compliance-report-pdf.tsx}
 */

import { data } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";

import { db } from "~/database/db.server";
import {
  readAssetInventoryFilters,
  readCustodySnapshotFilters,
} from "~/modules/reports/filters";
import {
  assetInventoryReport,
  custodySnapshotReport,
} from "~/modules/reports/helpers.server";
import { getReportById } from "~/modules/reports/registry";
import type {
  ReportPdfMeta,
  AssetInventoryPdfMeta,
  CustodySnapshotPdfMeta,
} from "~/modules/reports/types";
import { getDateTimeFormat, getLocale } from "~/utils/client-hints";
import { makeShelfError, ShelfError } from "~/utils/error";
import {
  payload,
  error,
  getParams,
  getCurrentSearchParams,
} from "~/utils/http.server";
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
  const { userId } = context.getSession();
  const { reportId } = getParams(
    params,
    z.object({
      reportId: z.string(),
    }),
    {
      additionalData: { userId },
    },
  );

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    // Validate report exists
    const reportDef = getReportById(reportId);
    if (!reportDef) {
      throw new ShelfError({
        cause: null,
        message: `Report "${reportId}" not found`,
        label: "Report",
        status: 404,
      });
    }

    /**
     * The filters the operator had applied on screen.
     *
     * These were parsed here and then never used, so a filtered report printed
     * as an unfiltered one — the PDF is the copy that gets filed, which makes
     * that the worst of the three places to silently ignore them. They are now
     * read from `modules/reports/filters.ts`, the same source the screen uses.
     */
    const searchParams = getCurrentSearchParams(request);

    // A PDF is the whole report, never a page of it.
    const paging = { page: 1, pageSize: 10000 };

    // Get organization info. `currency` is required so PDF monetary values
    // render in the workspace's configured currency rather than a hardcoded "$".
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        imageId: true,
        updatedAt: true,
        currency: true,
      },
    });

    if (!organization) {
      throw new ShelfError({
        cause: null,
        message: "Organization not found",
        label: "Organization",
        status: 404,
      });
    }

    // Locale drives number + currency formatting inside the PDF renderer.
    const locale = getLocale(request);

    // Common monetary fields threaded into every pdfMeta variant.
    const monetaryMeta = {
      currency: organization.currency,
      locale,
    };

    // Date formatter - use explicit options to avoid conflict with dateStyle
    // (the utility adds default year/month/day when timeStyle is missing,
    // which is incompatible with dateStyle)
    const dateFormat = getDateTimeFormat(request, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    // Generate report data based on type
    let pdfMeta: ReportPdfMeta;

    switch (reportId) {
      case "asset-inventory": {
        const reportData = await assetInventoryReport({
          organizationId,
          ...readAssetInventoryFilters(searchParams),
          ...paging,
        });

        // Calculate status breakdown
        const statusBreakdown = {
          available: 0,
          inCustody: 0,
          checkedOut: 0,
        };
        let totalValuation = 0;

        for (const row of reportData.rows) {
          if (row.status === "AVAILABLE") statusBreakdown.available++;
          else if (row.status === "IN_CUSTODY") statusBreakdown.inCustody++;
          else if (row.status === "CHECKED_OUT") statusBreakdown.checkedOut++;
          if (row.valuation) totalValuation += row.valuation;
        }

        pdfMeta = {
          ...monetaryMeta,
          reportId: "asset-inventory",
          reportTitle: reportDef.title,
          reportDescription: reportDef.description,
          organizationName: organization.name,
          organizationImageId: organization.imageId,
          organizationUpdatedAt: organization.updatedAt,
          generatedAt: dateFormat.format(new Date()),
          totalCount: reportData.totalRows,
          totalValuation,
          statusBreakdown,
          rows: reportData.rows.map((row) => ({
            assetId: row.assetId,
            assetName: row.assetName,
            status: row.status,
            category: row.category,
            location: row.location,
            custodian: row.custodian,
            valuation: row.valuation,
            qrId: row.qrId,
          })),
        } satisfies AssetInventoryPdfMeta;
        break;
      }

      case "custody-snapshot": {
        const reportData = await custodySnapshotReport({
          organizationId,
          ...readCustodySnapshotFilters(searchParams),
          ...paging,
        });

        // Calculate totals
        const uniqueCustodians = new Set(
          reportData.rows.map((r) => r.custodianName),
        );
        let totalValuation = 0;
        for (const row of reportData.rows) {
          if (row.valuation) totalValuation += row.valuation;
        }

        pdfMeta = {
          ...monetaryMeta,
          reportId: "custody-snapshot",
          reportTitle: reportDef.title,
          reportDescription: reportDef.description,
          organizationName: organization.name,
          organizationImageId: organization.imageId,
          organizationUpdatedAt: organization.updatedAt,
          generatedAt: dateFormat.format(new Date()),
          totalCount: reportData.totalRows,
          totalAssetsInCustody: reportData.totalRows,
          totalCustodians: uniqueCustodians.size,
          totalValuation,
          rows: reportData.rows.map((row) => ({
            assetId: row.assetId,
            assetName: row.assetName,
            category: row.category,
            location: row.location,
            custodianName: row.custodianName,
            assignedAt: dateFormat.format(new Date(row.assignedAt)),
            daysInCustody: row.daysInCustody,
            valuation: row.valuation,
          })),
        } satisfies CustodySnapshotPdfMeta;
        break;
      }

      default:
        throw new ShelfError({
          cause: null,
          message: `PDF export not implemented for report "${reportId}"`,
          label: "Report",
          status: 500,
        });
    }

    return data(payload({ pdfMeta }));
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, reportId });
    throw data(error(reason), { status: reason.status });
  }
};
