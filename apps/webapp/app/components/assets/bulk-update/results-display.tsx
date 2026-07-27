/**
 * @file Results stage for the bulk asset update import flow.
 * Displays a summary of applied changes (updated, unchanged, failed)
 * with collapsible detail sections and a downloadable CSV report.
 *
 * @see {@link file://./form.tsx} Parent orchestration component
 */
import { useTranslation } from "react-i18next";
import type { BulkUpdateResult } from "~/utils/import-update.server";
import { escapeCsvValue } from "./helpers";
import { SummaryPill } from "./shared";
import { Button } from "../../shared/button";
import { Table, Td, Th, Tr } from "../../table";

// ---------------------------------------------------------------------------
// Results Display (shown after bulk update is applied)
// ---------------------------------------------------------------------------

/**
 * Displays results after bulk update changes have been applied.
 * Shows summary pills, collapsible details for each outcome category,
 * and action buttons (import another file, download report, view assets).
 */
export function ResultsDisplay({
  result,
  onReset,
}: {
  result: BulkUpdateResult;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const handleDownloadReport = () => {
    const lines: string[] = ["Status,Row,Asset ID,Asset Name,Details"];

    for (const asset of result.updated) {
      lines.push(
        `Updated,,${escapeCsvValue(asset.id)},${escapeCsvValue(asset.title)},${
          asset.changesApplied
        } fields changed`,
      );
    }
    for (const asset of result.skipped) {
      lines.push(
        `Skipped,,${escapeCsvValue(asset.id)},${escapeCsvValue(
          asset.title,
        )},${escapeCsvValue(asset.reason)}`,
      );
    }
    for (const row of result.failed) {
      lines.push(
        `Failed,${row.rowNumber || ""},${escapeCsvValue(
          row.id || "(unknown)",
        )},${escapeCsvValue(
          row.title || row.id || "(unknown)",
        )},${escapeCsvValue(row.error)}`,
      );
    }
    for (const warning of result.warnings) {
      lines.push(
        `Warning,${warning.rowNumber || ""},${escapeCsvValue(
          warning.id || "(unknown)",
        )},,${escapeCsvValue(warning.message)}`,
      );
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-update-report-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 w-full">
      <h4 className="mb-3">{t("assetUpdate.updateComplete")}</h4>

      {/* Summary */}
      <div className="mb-4 flex gap-4 rounded-md border bg-gray-50 p-4 text-sm">
        <SummaryPill
          count={result.summary.updated}
          label={t("assetUpdate.pillUpdated")}
          color="green"
        />
        <SummaryPill
          count={result.summary.skipped}
          label={t("assetUpdate.pillUnchanged")}
          color="gray"
        />
        <SummaryPill
          count={result.summary.failed}
          label={t("assetUpdate.pillFailed")}
          color="red"
        />
        {result.warnings.length > 0 ? (
          <SummaryPill
            count={result.warnings.length}
            label={t("assetUpdate.pillWarnings")}
            color="yellow"
          />
        ) : null}
      </div>

      {/* Updated assets */}
      {result.updated.length > 0 && (
        <details className="mb-3" open>
          <summary className="cursor-pointer font-medium text-green-600">
            {t("assetUpdate.updatedSuccessfully", {
              count: result.updated.length,
            })}
          </summary>
          <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md border">
            <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
              <thead className="sticky top-0 bg-green-50">
                <Tr>
                  <Th>{t("assetUpdate.colAsset")}</Th>
                  <Th>{t("assetUpdate.colFieldsChanged")}</Th>
                </Tr>
              </thead>
              <tbody>
                {result.updated.map((asset) => (
                  <Tr key={asset.id}>
                    <Td>{asset.title}</Td>
                    <Td>{asset.changesApplied}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </details>
      )}

      {/* Skipped assets */}
      {result.skipped.length > 0 && (
        <details className="mb-3">
          <summary className="cursor-pointer text-sm text-gray-500">
            {result.skipped.length} asset
            {t("assetUpdate.unchangedCount", { count: result.skipped.length })}
          </summary>
          <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md border">
            <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
              <thead className="sticky top-0 bg-gray-50">
                <Tr>
                  <Th>{t("assetUpdate.colAsset")}</Th>
                  <Th>{t("assetUpdate.colReason")}</Th>
                </Tr>
              </thead>
              <tbody>
                {result.skipped.map((asset) => (
                  <Tr key={asset.id}>
                    <Td>{asset.title}</Td>
                    <Td className="text-gray-500">{asset.reason}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </details>
      )}

      {/* Warnings — partial-apply rows (e.g. assetModel ignored on a
          QUANTITY_TRACKED row). The row's other cells still updated;
          this surfaces the dropped cell so the user knows it didn't take
          effect. Distinct from `failed` (whole-row reject) and `skipped`
          (nothing to apply). */}
      {result.warnings.length > 0 && (
        <details className="mb-3" open>
          <summary className="cursor-pointer font-medium text-yellow-700">
            {t("assetUpdate.warningsCount", {
              count: result.warnings.length,
            })}
          </summary>
          <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md border border-yellow-200">
            <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
              <thead className="sticky top-0 bg-yellow-50">
                <Tr>
                  <Th>{t("assetUpdate.colRow")}</Th>
                  <Th>{t("assetUpdate.colAsset")}</Th>
                  <Th>{t("assetUpdate.colWarning")}</Th>
                </Tr>
              </thead>
              <tbody>
                {result.warnings.map((warning) => (
                  <Tr key={`${warning.rowNumber}-${warning.id}`}>
                    <Td>{warning.rowNumber}</Td>
                    <Td>{warning.id || "(unknown)"}</Td>
                    <Td className="text-yellow-700">{warning.message}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </details>
      )}

      {/* Failed assets */}
      {result.failed.length > 0 && (
        <div className="mb-3">
          <h5 className="mb-1 font-medium text-red-600">
            {t("assetUpdate.failedRowsCount", { count: result.failed.length })}
          </h5>
          <div className="max-h-[200px] overflow-y-auto rounded-md border border-red-200">
            <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
              <thead className="sticky top-0 bg-red-50">
                <Tr>
                  <Th>{t("assetUpdate.colRow")}</Th>
                  <Th>{t("assetUpdate.colAsset")}</Th>
                  <Th>{t("assetUpdate.colError")}</Th>
                </Tr>
              </thead>
              <tbody>
                {result.failed.map((row) => (
                  <Tr key={`${row.rowNumber}-${row.id}`}>
                    <Td>{row.rowNumber}</Td>
                    <Td>{row.title || row.id || "(unknown)"}</Td>
                    <Td className="text-red-600">{row.error}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="secondary" onClick={onReset}>
          {t("assetUpdate.importAnotherFile")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleDownloadReport}
        >
          {t("assetUpdate.downloadReport")}
        </Button>
        <Button to="/assets">{t("assetUpdate.viewAssets")}</Button>
      </div>
    </div>
  );
}
