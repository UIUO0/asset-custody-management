/**
 * @file Preview stage for the bulk asset update import flow.
 * Displays the server-generated diff analysis before changes are applied,
 * including summary stats, validation warnings, new entity creation notices,
 * a spreadsheet-style change grid, and the "I AGREE" confirmation dialog.
 *
 * @see {@link file://./form.tsx} Parent orchestration component
 * @see {@link file://./../../../utils/import-update.server.ts} Server-side preview logic
 */
import type React from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import type useFetcherWithReset from "~/hooks/use-fetcher-with-reset";
import type { action } from "~/routes/_layout+/assets.import-update";
import type { UpdatePreview } from "~/utils/import-update.server";
import { PREVIEW_DISPLAY_LIMIT } from "./helpers";
import { SummaryPill } from "./shared";
import { SpreadsheetPreview } from "./spreadsheet-preview";
import Input from "../../forms/input";
import { AlertIcon } from "../../icons/library";
import { Button } from "../../shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../shared/modal";
import { Table, Td, Th, Tr } from "../../table";

// ---------------------------------------------------------------------------
// Preview Display (shown after CSV analysis, before apply)
// ---------------------------------------------------------------------------

/**
 * Displays the server-generated bulk-update preview and handles the apply confirmation.
 * Shows summary statistics, validation warnings, unrecognized columns, new entity warnings,
 * failed rows, a spreadsheet-style change grid, and the "I AGREE" confirmation dialog.
 */
// react-doctor:no-giant-component — deferred for follow-up refactor
export function PreviewDisplay({
  preview,
  formRef,
  agreed,
  setAgreed,
  applyFetcher,
  isApplyLoading,
  selectedFile,
  onReanalyze,
  isReanalyzing,
  onReset,
}: {
  preview: UpdatePreview;
  formRef: React.RefObject<HTMLFormElement | null>;
  agreed: string;
  setAgreed: (v: string) => void;
  applyFetcher: ReturnType<typeof useFetcherWithReset<typeof action>>;
  isApplyLoading: boolean;
  selectedFile: File | null;
  onReanalyze: () => void;
  isReanalyzing: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const totalChanges = preview.totalFieldChanges;
  const totalAssets = preview.assetsToUpdate.length;
  const hasNewEntities =
    preview.newEntities.categories.length > 0 ||
    preview.newEntities.locations.length > 0 ||
    preview.newEntities.tags.length > 0;

  // Collect all field-level validation warnings
  const allWarnings = preview.assetsToUpdate.flatMap((asset) =>
    asset.changes
      .filter((c) => c.warning)
      .map((c) => ({
        assetTitle: asset.title,
        assetId: asset.id,
        field: c.field,
        value: c.newValue,
        warning: c.warning!,
      })),
  );
  const hasWarnings = allWarnings.length > 0;

  function submitApply() {
    if (!formRef.current || !selectedFile) return;
    const fd = new FormData(formRef.current);
    fd.set("intent", "apply-update");
    fd.set("confirmation", agreed);
    void applyFetcher.submit(fd, {
      method: "post",
      encType: "multipart/form-data",
    });
  }

  return (
    <div className="mt-4 w-full">
      {/* Summary section — always first */}
      <div className="mb-4 rounded-md border bg-gray-50 p-4">
        <h4 className="mb-3 text-base font-semibold">
          {t("assetUpdate.analysisSummary")}
        </h4>
        <div className="flex flex-wrap gap-3">
          <SummaryPill
            count={preview.assetsToUpdate.length}
            label={t("assetUpdate.pillToUpdate")}
            color="blue"
          />
          <SummaryPill
            count={preview.skippedAssets.length}
            label={t("assetUpdate.pillUnchanged")}
            color="gray"
          />
          <SummaryPill
            count={preview.failedRows.length}
            label={t("assetUpdate.pillFailed")}
            color="red"
          />
        </div>

        {/* Reassurance message */}
        {preview.totalUnchangedFields > 0 && (
          <p className="mt-3 text-sm text-gray-500">
            {t("assetUpdate.unchangedNotice", {
              fields: preview.totalUnchangedFields,
              assets:
                preview.assetsToUpdate.length + preview.skippedAssets.length,
            })}
          </p>
        )}
      </div>

      {/* Validation warnings — format issues that will cause failures */}
      {hasWarnings && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="mb-2 font-medium text-red-800">
            {t("assetUpdate.warningsNeedFixing", { count: allWarnings.length })}
          </p>
          <div className="max-h-[200px] overflow-y-auto">
            <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
              <thead className="sticky top-0 bg-red-50">
                <Tr>
                  <Th>{t("assetUpdate.colAsset")}</Th>
                  <Th>{t("assetUpdate.colField")}</Th>
                  <Th>{t("assetUpdate.colProblem")}</Th>
                </Tr>
              </thead>
              <tbody>
                {allWarnings.map((w) => (
                  // Composite key: one asset can have multiple warnings across
                  // different fields, so `assetId + field` uniquely identifies
                  // the row.
                  <Tr key={`${w.assetId}:${w.field}`}>
                    <Td className="font-medium">{w.assetTitle}</Td>
                    <Td>{w.field}</Td>
                    <Td className="text-red-600">{w.warning}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <p className="mt-2 text-sm text-red-700">
            Fix these values in your CSV and re-upload, or apply anyway — rows
            with invalid values will be partially updated (valid fields will
            still be saved, invalid ones will be skipped).
          </p>
        </div>
      )}

      {/* Unrecognized columns — the user added columns that don't exist */}
      {preview.unrecognizedColumns.length > 0 && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4">
          <p className="mb-1 font-medium text-blue-800">
            {t("assetUpdate.skippedColumns", {
              count: preview.unrecognizedColumns.length,
            })}
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {preview.unrecognizedColumns.map((col) => (
              <span
                key={col}
                className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
              >
                {col}
              </span>
            ))}
          </div>
          <p className="text-sm text-blue-700">
            <Trans
              i18nKey="assetUpdate.createCustomFieldsHint"
              components={{
                1: (
                  <Button
                    variant="link"
                    to="/settings/custom-fields"
                    target="_blank"
                  />
                ),
              }}
            />
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            onClick={onReanalyze}
            disabled={isReanalyzing}
          >
            {isReanalyzing ? "Re-analyzing..." : t("assetUpdate.reanalyzeFile")}
          </Button>
        </div>
      )}

      {/* Known but unsupported columns */}
      {preview.ignoredColumns.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm text-gray-500">
            {t("assetUpdate.readOnlyColumns", {
              count: preview.ignoredColumns.length,
            })}
          </summary>
          <p className="mt-1 text-xs text-gray-500">
            {t("assetUpdate.readOnlyColumnsBody", {
              columns: preview.ignoredColumns.join(", "),
            })}
          </p>
        </details>
      )}

      {/* New entity creation warning */}
      {hasNewEntities && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 font-medium text-amber-800">
            <AlertIcon className="inline-block size-4" />{" "}
            {t("assetUpdate.newItemsWillBeCreated")}
          </p>
          <p className="mb-2 text-sm text-amber-700">
            {t("assetUpdate.newItemsBody")}
          </p>
          <div className="space-y-1 text-sm text-amber-800">
            {preview.newEntities.categories.length > 0 && (
              <p>
                <strong>{t("assetUpdate.newCategories")}</strong>{" "}
                {preview.newEntities.categories.map((name, i) => (
                  // The entity name is unique within its own list (dedup'd on
                  // the server), so it's a stable key here.
                  <span key={name}>
                    {i > 0 && ", "}
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                      {name}
                    </span>
                  </span>
                ))}
              </p>
            )}
            {preview.newEntities.locations.length > 0 && (
              <p>
                <strong>{t("assetUpdate.newLocations")}</strong>{" "}
                {preview.newEntities.locations.map((name, i) => (
                  <span key={name}>
                    {i > 0 && ", "}
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                      {name}
                    </span>
                  </span>
                ))}
              </p>
            )}
            {preview.newEntities.tags.length > 0 && (
              <p>
                <strong>{t("assetUpdate.newTags")}</strong>{" "}
                {preview.newEntities.tags.map((name, i) => (
                  <span key={name}>
                    {i > 0 && ", "}
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                      {name}
                    </span>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Failed rows */}
      {preview.failedRows.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-red-600">
            {t("assetUpdate.failedRows", { count: preview.failedRows.length })}
          </h4>
          <div className="max-h-[200px] overflow-y-auto rounded-md border border-red-200">
            <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
              <thead className="sticky top-0 bg-red-50">
                <Tr>
                  <Th>{t("assetUpdate.colRow")}</Th>
                  <Th>{t("assetUpdate.colId")}</Th>
                  <Th>{t("assetUpdate.colReason")}</Th>
                </Tr>
              </thead>
              <tbody>
                {preview.failedRows.map((row) => (
                  // `rowNumber` is the 1-based CSV line number and is unique
                  // per row in the uploaded file.
                  <Tr key={row.rowNumber}>
                    <Td>{row.rowNumber}</Td>
                    <Td className="font-mono text-xs">
                      {row.id || t("assetUpdate.empty")}
                    </Td>
                    <Td className="text-red-600">{row.reason}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}

      {/* Spreadsheet-style change grid */}
      {preview.assetsToUpdate.length > 0 && (
        <div>
          <SpreadsheetPreview
            assets={preview.assetsToUpdate}
            columns={preview.updatableColumns}
            displayLimit={PREVIEW_DISPLAY_LIMIT}
            totalChanges={totalChanges}
          />
        </div>
      )}

      {/* Skipped assets (collapsible) */}
      {preview.skippedAssets.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm text-gray-500">
            {t("assetUpdate.noChangeAssets", {
              count: preview.skippedAssets.length,
            })}
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
                {preview.skippedAssets.map((asset) => (
                  // Asset `id` here is the CSV sequential identifier
                  // (e.g. "SAM-0022"), unique within the uploaded file.
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

      {/* Apply confirmation */}
      {preview.assetsToUpdate.length > 0 && (
        <div className="mt-2 flex items-center gap-3">
          <AlertDialog
            onOpenChange={(open) => {
              if (!open) {
                setAgreed("");
              }
            }}
          >
            <AlertDialogTrigger asChild>
              <Button type="button">
                {t("assetUpdate.applyChangesButton", {
                  changes: totalChanges,
                  assets: totalAssets,
                })}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[600px]">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("assetUpdate.confirmTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans
                    i18nKey="assetUpdate.confirmBody"
                    values={{ changes: totalChanges, assets: totalAssets }}
                    components={{ 1: <strong />, 3: <strong /> }}
                  />
                </AlertDialogDescription>
                {hasNewEntities && (
                  <AlertDialogDescription>
                    <span className="text-amber-600">
                      {t("assetUpdate.willAlsoCreate", {
                        summary: [
                          preview.newEntities.categories.length > 0 &&
                            t("assetUpdate.newCategoriesCount", {
                              count: preview.newEntities.categories.length,
                            }),
                          preview.newEntities.locations.length > 0 &&
                            t("assetUpdate.newLocationsCount", {
                              count: preview.newEntities.locations.length,
                            }),
                          preview.newEntities.tags.length > 0 &&
                            t("assetUpdate.newTagsCount", {
                              count: preview.newEntities.tags.length,
                            }),
                        ]
                          .filter(Boolean)
                          .join(", "),
                      })}
                    </span>
                  </AlertDialogDescription>
                )}
                <AlertDialogDescription>
                  <Trans
                    i18nKey="assetUpdate.typeToConfirm"
                    components={{ 1: <b /> }}
                  />
                </AlertDialogDescription>
                {/* Server-side apply error shown inside the dialog */}
                {applyFetcher.data?.error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {applyFetcher.data.error.message ||
                      t("assetUpdate.applyError")}
                  </div>
                )}
                <ConfirmationInput
                  agreed={agreed}
                  setAgreed={setAgreed}
                  isApplyLoading={isApplyLoading}
                  submitApply={submitApply}
                />
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="secondary">
                    {t("common.cancel")}
                  </Button>
                </AlertDialogCancel>
                <Button
                  type="button"
                  disabled={agreed !== t("ui.iAgree") || isApplyLoading}
                  onClick={submitApply}
                >
                  {isApplyLoading
                    ? "Applying..."
                    : t("assetUpdate.applyChanges", { count: totalChanges })}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button type="button" variant="secondary" onClick={onReset}>
            {t("assetUpdate.startOver")}
          </Button>
        </div>
      )}

      {preview.assetsToUpdate.length === 0 && (
        <p className="mt-4 text-gray-500">
          {t("assetUpdate.noChangesDetected")}
        </p>
      )}
    </div>
  );
}

/**
 * Confirmation input for the "I AGREE" apply dialog.
 *
 * Extracted into its own component so we can focus the input on mount via
 * `useAutoFocus` instead of the `autoFocus` attribute (flagged by
 * `jsx-a11y/no-autofocus` — autofocus hurts screen-reader and keyboard users).
 * The component is only mounted when the AlertDialog opens, so the focus
 * fires exactly when the user actually needs the input focused.
 */
function ConfirmationInput({
  agreed,
  setAgreed,
  isApplyLoading,
  submitApply,
}: {
  agreed: string;
  setAgreed: (v: string) => void;
  isApplyLoading: boolean;
  submitApply: () => void;
}) {
  const { t } = useTranslation();
  // Focus once when the dialog opens so the user can start typing "I AGREE"
  // immediately. Safe because this component only mounts inside the open
  // AlertDialog, never ambiently.
  const inputRef = useAutoFocus<HTMLInputElement>();

  return (
    <Input
      ref={inputRef}
      type="text"
      label={t("assetUpdate.confirmationLabel")}
      name="agree"
      value={agreed}
      onChange={(e) => setAgreed(e.target.value.toUpperCase())}
      placeholder={t("ui.iAgree")}
      pattern="^I AGREE$"
      required
      onKeyDown={(e) => {
        if (e.key === "Enter" && agreed === t("ui.iAgree") && !isApplyLoading) {
          e.preventDefault();
          submitApply();
        }
      }}
    />
  );
}
