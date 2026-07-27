import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { isQuantityTracked } from "~/modules/asset/utils";
import { createCustodianSchema } from "~/modules/custody/schema";
import { type loader } from "~/routes/_layout+/assets._index";
import { tw } from "~/utils/tw";
import { resolveTeamMemberName } from "~/utils/user";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import DynamicSelect from "../dynamic-select/dynamic-select";
import { Button } from "../shared/button";
import { WarningBox } from "../shared/warning-box";

export const BulkAssignCustodySchema = z.object({
  assetIds: z.array(z.string()).min(1),
  custodian: createCustodianSchema(),
});

export default function BulkAssignCustodyDialog() {
  const { t } = useTranslation();
  const zo = useZorm("BulkAssignCustody", BulkAssignCustodySchema);

  const { isSelfService } = useUserRoleHelper();
  const { currentUserTeamMember } = useLoaderData<typeof loader>();

  const selectedItems = useAtomValue(selectedBulkItemsAtom);
  const quantityTrackedCount = selectedItems.filter((item) =>
    isQuantityTracked(item),
  ).length;

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="assign-custody"
      title={
        isSelfService
          ? t("bulkActions.takeCustodyTitle")
          : t("bulkActions.assignCustodyTitle")
      }
      description={
        isSelfService
          ? t("bulkActions.takeCustodyDescription")
          : t("bulkActions.assignCustodyDescription")
      }
      actionUrl="/api/assets/bulk-assign-custody"
      arrayFieldId="assetIds"
    >
      {({ disabled, handleCloseDialog, fetcherError }) => (
        <div className="modal-content-wrapper">
          {quantityTrackedCount > 0 ? (
            <div className="mb-4">
              <WarningBox>
                <span>
                  {t("bulkActions.qtyTrackedSkippedCustody", {
                    count: quantityTrackedCount,
                  })}
                </span>
              </WarningBox>
            </div>
          ) : null}
          <div className="relative z-50 mb-8">
            {isSelfService && currentUserTeamMember ? (
              <input
                type="hidden"
                name="custodian"
                value={JSON.stringify({
                  id: currentUserTeamMember.id,
                  name: resolveTeamMemberName(currentUserTeamMember),
                })}
              />
            ) : (
              <DynamicSelect
                disabled={disabled}
                model={{
                  name: "teamMember",
                  queryKey: "name",
                  deletedAt: null,
                }}
                fieldName="custodian"
                contentLabel={t("bookingForm.teamMembers")}
                initialDataKey="teamMembers"
                countKey="totalTeamMembers"
                placeholder={t("bookingForm.selectTeamMember")}
                allowClear
                closeOnSelect
                transformItem={(item) => ({
                  ...item,
                  id: JSON.stringify({
                    id: item.id,
                    /**
                     * This is parsed on the server, because we need the name to create the note.
                     * @TODO This should be refactored to send the name as some metadata, instaed of like this
                     */
                    name: resolveTeamMemberName(item),
                  }),
                })}
                renderItem={(item) => resolveTeamMemberName(item, true)}
              />
            )}
            {zo.errors.custodian()?.message ? (
              <p className="text-sm text-error-500">
                {zo.errors.custodian()?.message}
              </p>
            ) : null}
            {fetcherError ? (
              <p className="text-sm text-error-500">{fetcherError}</p>
            ) : null}
          </div>

          <div className={tw("flex gap-3", isSelfService && "-mt-8")}>
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}
    </BulkUpdateDialogContent>
  );
}
