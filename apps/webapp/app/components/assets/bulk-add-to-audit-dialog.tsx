import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import z from "zod";
import { bulkDialogAtom } from "~/atoms/bulk-update-dialog";
import {
  selectedBulkItemsAtom,
  selectedBulkItemsCountAtom,
} from "~/atoms/list";
import useApiQuery from "~/hooks/use-api-query";
import { isSelectingAllItems } from "~/utils/list";
import AuditSelector from "../audit/audit-selector";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import type { IndexResponse } from "../list";
import { Button } from "../shared/button";

export const BulkAddToAuditSchema = z.object({
  assetIds: z.string().array().min(1),
  auditId: z.string().min(1, "Please select an audit"),
});

type PendingAudit = {
  id: string;
  name: string;
  createdAt: Date;
  expectedAssetCount: number;
  createdBy: {
    firstName: string | null;
    lastName: string | null;
  };
  assignments: Array<{
    user: {
      firstName: string | null;
      lastName: string | null;
    };
  }>;
};

export default function BulkAddToAuditDialog() {
  const { t } = useTranslation();
  const zo = useZorm("BulkAddToAudit", BulkAddToAuditSchema);

  const { totalItems } = useLoaderData<IndexResponse>();
  const selectedItems = useAtomValue(selectedBulkItemsAtom);
  const selectedCount = useAtomValue(selectedBulkItemsCountAtom);
  const bulkDialogOpenState = useAtomValue(bulkDialogAtom);

  const isOpen = bulkDialogOpenState["add-to-audit"] === true;

  // Show totalItems when "Select All" is used, otherwise show selected count
  const allSelected = isSelectingAllItems(selectedItems);
  const displayCount = allSelected ? totalItems : selectedCount;

  const { data, isLoading, error } = useApiQuery<{
    audits: PendingAudit[];
  }>({
    api: "/api/audits/get-pending",
    enabled: isOpen,
  });

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="add-to-audit"
      title={t("bulkActions.addToAuditTitle")}
      description={t("bulkActions.addToAuditDescription", {
        count: displayCount,
      })}
      actionUrl="/api/audits/add-assets"
      arrayFieldId="assetIds"
      skipCloseOnSuccess={true}
      // why: this dialog stays open showing a success panel; keeping the selection
      // avoids a stale "(0)" count in the title and matches add-to-existing-booking.
      keepSelectionOnSuccess={true}
    >
      {({ fetcherError, fetcherData, disabled, handleCloseDialog }) => {
        const isSuccess = fetcherData?.success;
        const selectedAuditId = fetcherData?.auditId;

        return (
          <div className="modal-content-wrapper">
            {isSuccess ? (
              // Success state
              <>
                <div className="mb-6 rounded-md border border-success-200 bg-success-50 p-4">
                  <p className="text-sm font-medium text-success-900">
                    {t("bulkActions.addedToAudit", {
                      count: fetcherData.addedCount,
                    })}
                  </p>
                  {fetcherData.skippedCount > 0 && (
                    <p className="mt-2 text-sm text-success-700">
                      {t("bulkActions.skippedInAudit", {
                        count: fetcherData.skippedCount,
                      })}
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    width="full"
                    onClick={handleCloseDialog}
                  >
                    {t("common.close")}
                  </Button>
                  {selectedAuditId && (
                    <Button
                      variant="primary"
                      width="full"
                      to={`/audits/${selectedAuditId}/overview`}
                      onClick={handleCloseDialog}
                    >
                      {t("bulkActions.viewAudit")}
                    </Button>
                  )}
                </div>
              </>
            ) : !isLoading && data?.audits?.length === 0 ? (
              // Empty state - no pending audits
              <>
                <div className="mb-6 rounded-md border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">
                    {t("bulkActions.noPendingAudits")}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    width="full"
                    onClick={handleCloseDialog}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    width="full"
                    to="/audits"
                    onClick={handleCloseDialog}
                  >
                    {t("bulkActions.createNewAudit")}
                  </Button>
                </div>
              </>
            ) : (
              // Form state
              <>
                <div className="relative z-50 mb-8">
                  <AuditSelector
                    name={zo.fields.auditId()}
                    audits={data?.audits || []}
                    placeholder={
                      isLoading ? "Loading..." : t("bulkActions.selectAnAudit")
                    }
                    isLoading={isLoading}
                    error={
                      zo.errors.auditId()?.message || error || fetcherError
                    }
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    width="full"
                    disabled={disabled}
                    onClick={handleCloseDialog}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    width="full"
                    disabled={disabled}
                  >
                    {disabled ? "Adding..." : t("bulkActions.addToAudit")}
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      }}
    </BulkUpdateDialogContent>
  );
}
