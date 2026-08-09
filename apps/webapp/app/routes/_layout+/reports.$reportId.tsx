/**
 * Report Runner Route
 *
 * Dynamic route that renders a specific report based on the reportId param.
 * The route owns three concerns:
 *   1. Permission + data loading via the per-report `*Report` server helpers.
 *   2. The page chrome (header, footer).
 *   3. Stitching together the small set of composition primitives
 *      (`ReportExportActions`, `ReportFilterBar`, `ReportContentSwitch`)
 *      that live under `~/components/reports/`.
 *
 * Each piece below — including the row-click handlers (`useReportRowHandlers`)
 * and the CSV export flow (`useCsvExport`) — lives in its own module so
 * the page component stays a thin wiring layer.
 *
 * @see {@link file://../../modules/reports/registry.ts}
 * @see {@link file://../../modules/reports/helpers.server.ts}
 * @see {@link file://../../components/reports/index.ts}
 */

import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, useLoaderData, useNavigation } from "react-router";

import Header from "~/components/layout/header";
import {
  ReportContentSwitch,
  ReportExportActions,
  ReportFilterBar,
  ReportFooter,
  useCsvExport,
  useReportRowHandlers,
} from "~/components/reports";
import {
  readAssetActivityFilters,
  readAssetInventoryFilters,
  readCustodySnapshotFilters,
  readIdleAssetsFilters,
} from "~/modules/reports/filters";
import {
  idleAssetsReport,
  custodySnapshotReport,
  assetDistributionReport,
  assetInventoryReport,
  assetActivityReport,
} from "~/modules/reports/helpers.server";
import { getReportById } from "~/modules/reports/registry";
import type {
  DistributionBreakdown,
  ReportPayload,
} from "~/modules/reports/types";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { ShelfError } from "~/utils/error";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: appendToMetaTitle(data?.report?.title || "Report") },
];

/**
 * Adds the report-specific name to the breadcrumb trail (e.g.
 * "Reports > Top Booked Assets"). The parent `reports.tsx` layout supplies
 * the leading "Reports" crumb.
 */
export const handle = {
  breadcrumb: (match: { data?: { report?: { title?: string } } }) =>
    match?.data?.report?.title || "Report",
};

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  const { reportId } = params;
  if (!reportId) {
    throw new ShelfError({
      cause: null,
      message: "Report ID is required",
      label: "Report",
    });
  }

  // Validate report exists and is enabled
  const reportDef = getReportById(reportId);
  if (!reportDef) {
    throw new ShelfError({
      cause: null,
      message: `Report "${reportId}" not found`,
      label: "Report",
      status: 404,
    });
  }

  if (!reportDef.enabled) {
    throw new ShelfError({
      cause: null,
      message: `Report "${reportDef.title}" is not yet available`,
      label: "Report",
      status: 403,
    });
  }

  // Check permissions
  const { organizationId } = await requirePermission({
    userId,
    request,
    entity: PermissionEntity.asset,
    action: PermissionAction.read,
  });

  /**
   * Filters come from `modules/reports/filters.ts` — the same readers the CSV
   * and PDF exports use. They were inlined here and copied nowhere, which is
   * how both exports ended up ignoring every filter this screen applies.
   */
  const url = new URL(request.url);

  // Paging is the screen's own concern; the exports take everything.
  const paging = {
    page: parseInt(url.searchParams.get("page") || "1", 10),
    pageSize: parseInt(url.searchParams.get("pageSize") || "50", 10),
  };

  // Load report data based on report ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reportData: ReportPayload<any>;

  switch (reportId) {
    case "idle-assets":
      reportData = await idleAssetsReport({
        organizationId,
        ...readIdleAssetsFilters(url.searchParams),
        ...paging,
      });
      break;

    case "custody-snapshot":
      reportData = await custodySnapshotReport({
        organizationId,
        ...readCustodySnapshotFilters(url.searchParams),
        ...paging,
      });
      break;

    case "distribution":
      // Takes no filters — it summarises the whole workspace.
      reportData = await assetDistributionReport({
        organizationId,
        ...paging,
      });
      break;

    case "asset-inventory":
      reportData = await assetInventoryReport({
        organizationId,
        ...readAssetInventoryFilters(url.searchParams),
        ...paging,
      });
      break;

    case "asset-activity":
      reportData = await assetActivityReport({
        organizationId,
        ...readAssetActivityFilters(url.searchParams),
        ...paging,
      });
      break;

    default:
      throw new ShelfError({
        cause: null,
        message: `Report "${reportId}" is not implemented`,
        label: "Report",
        status: 500,
      });
  }

  return data({
    ...reportData,
    reportId,
    // Standard header object for the app's Header component
    header: {
      title: reportData.report.title,
      subHeading: reportData.report.description,
    },
  });
}

export default function ReportPage() {
  const loaderData = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const handlers = useReportRowHandlers();

  // Show loading state when navigating (timeframe change, pagination, etc.)
  const isLoading = navigation.state === "loading";

  const {
    reportId,
    kpis,
    rows,
    filters,
    computedMs,
    totalRows,
    page,
    pageSize,
    distributionBreakdown,
  } = loaderData as typeof loaderData & {
    distributionBreakdown?: DistributionBreakdown;
  };

  const { isExporting, handleExport } = useCsvExport(
    reportId,
    filters.timeframe.preset,
  );

  const hasData = rows.length > 0;

  return (
    <>
      <Header>
        <ReportExportActions
          reportId={reportId}
          timeframe={filters.timeframe}
          hasData={hasData}
          isExporting={isExporting}
          onCsvExport={handleExport}
        />
      </Header>

      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 md:mt-4 md:px-0">
        <ReportFilterBar
          reportId={reportId}
          timeframe={filters.timeframe}
          isLoading={isLoading}
        />

        <div className={tw("transition-opacity", isLoading && "opacity-60")}>
          <ReportContentSwitch
            reportId={reportId}
            rows={rows}
            kpis={kpis}
            totalRows={totalRows}
            timeframe={filters.timeframe}
            distributionBreakdown={distributionBreakdown}
            handlers={handlers}
          />
        </div>

        <div className="rounded border border-gray-200 bg-white px-4 py-2">
          <ReportFooter
            computedMs={computedMs}
            totalRows={totalRows}
            page={page}
            pageSize={pageSize}
            hideRowCount={reportId === "distribution"}
          />
        </div>
      </div>
    </>
  );
}
