import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { type loader } from "~/routes/_layout+/settings.custom-fields.index";
import { isSelectingAllItems } from "~/utils/list";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

export const BulkDeactivateCustomFieldSchema = z.object({
  customFieldIds: z.array(z.string()).min(1),
});

export default function BulkDeactivateDialog() {
  const { t } = useTranslation();
  const { totalItems } = useLoaderData<typeof loader>();

  const zo = useZorm(
    "BulkDeactivateCustomFields",
    BulkDeactivateCustomFieldSchema,
  );

  const selectedCustomFields = useAtomValue(selectedBulkItemsAtom);

  const totalSelected = isSelectingAllItems(selectedCustomFields)
    ? totalItems
    : selectedCustomFields.length;

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="deactivate"
      arrayFieldId="customFieldIds"
      actionUrl="/api/custom-fields/bulk-actions"
      title={t("customFields.deactivateTitle", { count: totalSelected })}
      description={t("customFields.deactivateDesc", { count: totalSelected })}
    >
      {({ disabled, handleCloseDialog, fetcherError }) => (
        <>
          <input type="hidden" value="bulk-deactivate" name="intent" />

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
              {t("common.confirm")}
            </Button>
          </div>
        </>
      )}
    </BulkUpdateDialogContent>
  );
}
