/**
 * Bulk approve dialog (اعتماد جماعي)
 *
 * Releases every selected asset from the intake queue (`PENDING` → `READY`) in
 * one action. Assets already released are skipped server-side, so a select-all
 * over a mixed page behaves sensibly.
 *
 * Only the release direction is offered in bulk — sending assets back requires
 * a per-asset reason, and one reason pasted across a hundred rows would make
 * the note trail worthless.
 *
 * Rendered only for roles holding `asset.approve`; the route action re-checks.
 *
 * @see {@link file://./../../routes/api+/assets.bulk-approve.ts}
 * @see {@link file://./../../modules/asset/service.server.ts} `bulkApproveAssets`
 */

import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

/** Payload for the bulk-approve action */
export const BulkApproveAssetsSchema = z.object({
  assetIds: z.string().array().min(1),
});

/**
 * Confirmation body for the "approve" entry in the asset bulk-actions menu.
 */
export default function BulkApproveDialog() {
  const { t } = useTranslation();
  const zo = useZorm("BulkApproveAssets", BulkApproveAssetsSchema);

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="approve"
      title={t("assetLifecycle.bulkApproveTitle")}
      description={t("assetLifecycle.bulkApproveDescription")}
      actionUrl="/api/assets/bulk-approve"
      arrayFieldId="assetIds"
    >
      {({ fetcherError, disabled, handleCloseDialog }) => (
        <div className="modal-content-wrapper">
          {fetcherError ? (
            <p className="text-sm text-error-500">{fetcherError}</p>
          ) : null}

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
              {t("assetLifecycle.approveAction")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
