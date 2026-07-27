import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import z from "zod";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

export const BulkRemoveFromKitsSchema = z.object({
  assetIds: z.string().array().min(1),
});

export default function BulkRemoveFromKits() {
  const { t } = useTranslation();
  const zo = useZorm("BulkRemoveFromKits", BulkRemoveFromKitsSchema);

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="remove-from-kit"
      title={t("bulkActions.removeFromKitsTitle")}
      description={t("bulkActions.removeFromKitsDescription")}
      actionUrl="/api/assets/bulk-remove-from-kits"
      arrayFieldId="assetIds"
    >
      {({ disabled, handleCloseDialog, fetcherError }) => (
        <div className="modal-content-wrapper">
          {fetcherError ? (
            <p className="mb-2 text-sm text-error-500">{fetcherError}</p>
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
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
