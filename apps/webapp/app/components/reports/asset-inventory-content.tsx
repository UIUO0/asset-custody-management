/**
 * @file Asset Inventory report content.
 *
 * Renders the "Asset Inventory" report: a hero section summarizing total
 * assets, total value, and availability counts, followed by a sortable data
 * table of every asset in the workspace. Used by the report renderer in
 * `~/routes/_layout+/reports.$reportId.tsx` for the `asset-inventory` report.
 *
 * The status helpers (`getAssetStatusVariant`, `formatAssetStatus`) are kept
 * private to this module on purpose. Other report content components that
 * need the same behaviour copy these helpers locally so each extracted file
 * stays independent during the parallel refactor (Phase A). Once all content
 * components are extracted, we can promote them to a shared module.
 *
 * @see {@link file://./../../routes/_layout+/reports.$reportId.tsx}
 */

import type { ColumnDef } from "@tanstack/react-table";

import { useTranslation } from "react-i18next";
import { ReportEmptyState } from "~/components/reports/report-empty-state";
import {
  AssetCell,
  CurrencyCell,
  DateCell,
  ReportTable,
  StatusCell,
} from "~/components/reports/report-table";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import type { AssetInventoryRow, ReportKpi } from "~/modules/reports/types";
import { useHints } from "~/utils/client-hints";
import { formatCurrency } from "~/utils/currency";

/**
 * Map asset status to badge variant.
 * Matches the colors used in asset-status-badge.tsx:
 * - AVAILABLE → green (success)
 * - IN_CUSTODY → blue
 * - CHECKED_OUT → violet
 */
function getAssetStatusVariant(
  status: string,
): "success" | "blue" | "violet" | "neutral" {
  switch (status) {
    case "AVAILABLE":
      return "success";
    case "IN_CUSTODY":
      return "blue";
    case "CHECKED_OUT":
      return "violet";
    default:
      return "neutral";
  }
}

/**
 * Status pill for an inventory row, translated at render time.
 *
 * Wraps {@link StatusCell} in a component so the `useTranslation` hook has a
 * stable call position — the column definitions are module-scope and their
 * `cell` renderers run per row.
 *
 * @param props.status - Raw status value from the report row
 */
function AssetStatusCell({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = assetStatusKey(status);

  return (
    <StatusCell
      status={key ? t(key) : status}
      variant={getAssetStatusVariant(status)}
    />
  );
}

/**
 * Resolves the i18n key for an asset status.
 *
 * Returns a key rather than copy: this helper is module-scope (used by the
 * hoisted column definitions), so the caller resolves it with `t()`. Keys come
 * from the shared `status` namespace, keeping these labels identical to
 * `asset-status-badge.tsx`.
 */
function assetStatusKey(status: string): string | null {
  const keys: Record<string, string> = {
    AVAILABLE: "status.AVAILABLE",
    IN_CUSTODY: "status.IN_CUSTODY",
    CHECKED_OUT: "status.CHECKED_OUT",
  };
  return keys[status] ?? null;
}

/**
 * Column definitions for the Asset Inventory table, hoisted to module
 * scope so cell function refs stay stable across re-renders. Same loop
 * fix as IDLE_ASSETS_COLUMNS.
 */
const ASSET_INVENTORY_COLUMNS: ColumnDef<AssetInventoryRow>[] = [
  {
    accessorKey: "assetName",
    header: "reports.colAsset",
    cell: ({ row }) => (
      <AssetCell
        name={row.original.assetName}
        thumbnailImage={row.original.thumbnailImage}
        assetId={row.original.assetId}
      />
    ),
  },
  {
    accessorKey: "status",
    header: "reports.colStatus",
    cell: ({ row }) => <AssetStatusCell status={row.original.status} />,
  },
  {
    accessorKey: "category",
    header: "reports.colCategory",
    cell: ({ row }) =>
      row.original.category || <span className="text-gray-400">—</span>,
  },
  {
    accessorKey: "location",
    header: "reports.colLocation",
    cell: ({ row }) =>
      row.original.location || <span className="text-gray-400">—</span>,
  },
  {
    accessorKey: "custodian",
    header: "reports.assignedTo",
    cell: ({ row }) =>
      row.original.custodian || <span className="text-gray-400">—</span>,
  },
  {
    accessorKey: "valuation",
    header: "reports.colValue",
    // Asset-aware: shows TOTAL (valuation × quantity) for QT assets, with
    // a "<unit price> × N <unit>" subtext. INDIVIDUAL assets render the
    // single-line value as before. See {@link CurrencyCell}.
    cell: ({ row }) => <CurrencyCell asset={row.original} treatZeroAsEmpty />,
  },
  {
    accessorKey: "createdAt",
    header: "reports.colCreated",
    cell: ({ row }) => <DateCell date={row.original.createdAt} />,
  },
];

/** Props for {@link AssetInventoryContent}. */
type Props = {
  /** All asset inventory rows to render in the table. */
  rows: AssetInventoryRow[];
  /** KPI summary values powering the hero section (total/value/avail/in-custody). */
  kpis: ReportKpi[];
  /** Total row count for the badge next to the table title. */
  totalRows: number;
  /** Optional handler invoked when a table row is clicked (e.g. navigate to asset). */
  onRowClick?: (row: AssetInventoryRow) => void;
};

/**
 * Asset Inventory report content.
 *
 * Renders a hero summary (total assets, total value, available count,
 * in-custody count) plus a sortable data table of every asset. Designed
 * to be rendered by the report renderer in `reports.$reportId.tsx`.
 */
export function AssetInventoryContent({
  rows,
  kpis,
  totalRows,
  onRowClick,
}: Props) {
  const { t } = useTranslation();
  const currentOrganization = useCurrentOrganization();
  const { locale } = useHints();

  // Stable reference is guaranteed by `ASSET_INVENTORY_COLUMNS` living at
  // module scope (see its JSDoc for why that matters).
  const columns = ASSET_INVENTORY_COLUMNS;

  // Extract KPI values
  const totalAssets =
    (kpis.find((k) => k.id === "total_assets")?.rawValue as number) || 0;
  const totalValue =
    (kpis.find((k) => k.id === "total_value")?.rawValue as number) || 0;
  const availableCount =
    (kpis.find((k) => k.id === "available_count")?.rawValue as number) || 0;
  const inCustodyCount =
    (kpis.find((k) => k.id === "in_custody_count")?.rawValue as number) || 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Hero section */}
      <div className="rounded border border-gray-200 bg-white">
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-6">
          {/* Main metric */}
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-gray-900">
                {totalAssets}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-700">
                {t("reports.totalAssets")}
              </span>
            </div>
          </div>

          {/* Supporting stats */}
          <div className="flex gap-6 border-t border-gray-100 pt-3 md:border-l md:border-t-0 md:ps-6 md:pt-0">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">
                {t("reports.totalValue")}
              </span>
              <span className="text-lg font-medium text-gray-900">
                {totalValue > 0
                  ? formatCurrency({
                      value: totalValue,
                      currency: currentOrganization?.currency ?? "USD",
                      locale,
                    })
                  : "—"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">
                {t("reports.notInUse")}
              </span>
              <span className="text-lg font-medium text-gray-900">
                {availableCount}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">
                {t("reports.colAssigned")}
              </span>
              <span className="text-lg font-medium text-gray-900">
                {inCustodyCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Data table */}
      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 md:px-6">
          <h3 className="text-sm font-semibold text-gray-900">
            {t("nav.assets")}
          </h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {totalRows}
          </span>
        </div>
        <ReportTable
          data={rows}
          columns={columns}
          onRowClick={onRowClick}
          emptyContent={
            <ReportEmptyState
              reason="no_data"
              title={t("reports.noAssets")}
              description={t("reports.inventoryEmpty")}
            />
          }
        />
      </div>
    </div>
  );
}
