import { useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useNavigation } from "react-router";
import { useHydrated } from "remix-utils/use-hydrated";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { useControlledDropdownMenu } from "~/hooks/use-controlled-dropdown-menu";
import { useUserData } from "~/hooks/use-user-data";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { getPrimaryCustody } from "~/modules/custody/utils";
import { isFormProcessing } from "~/utils/form";
import { isSelectingAllItems } from "~/utils/list";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { tw } from "~/utils/tw";
import BulkAddToAuditDialog from "./bulk-add-to-audit-dialog";
import BulkAddToKitDialog from "./bulk-add-to-kit-dialog";
import BulkApproveDialog from "./bulk-approve-dialog";
import BulkAssignCustodyDialog from "./bulk-assign-custody-dialog";
import BulkCategoryUpdateDialog from "./bulk-category-update-dialog";
import BulkDeleteDialog from "./bulk-delete-dialog";
import BulkDownloadQrDialog from "./bulk-download-qr-dialog";
import BulkLocationUpdateDialog from "./bulk-location-update-dialog";
import BulkMarkAvailabilityDialog from "./bulk-mark-availability-dialog";
import BulkReleaseCustodyDialog from "./bulk-release-custody-dialog";
import BulkRemoveFromKits from "./bulk-remove-from-kits";
import BulkStartAuditDialog from "./bulk-start-audit-dialog";
import { BulkUpdateDialogTrigger } from "../bulk-update-dialog/bulk-update-dialog";
import Icon from "../icons/icon";
import { ChevronRight } from "../icons/library";
import { Button } from "../shared/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../shared/dropdown";
import { MobileDropdownStyles } from "../shared/mobile-dropdown-styles";
import When from "../when/when";

export default function BulkActionsDropdown() {
  const { t } = useTranslation();
  const isHydrated = useHydrated();

  if (!isHydrated) {
    return (
      <Button variant="secondary" to="#" className="font-medium">
        <span className="flex items-center gap-2">
          {t("list.actions")} <ChevronRight className="chev rotate-90" />
        </span>
      </Button>
    );
  }

  return (
    <div className="actions-dropdown flex w-full items-center gap-2">
      <ConditionalDropdown />
    </div>
  );
}

// react-doctor:no-giant-component — deferred for follow-up refactor
function ConditionalDropdown() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const isLoading = isFormProcessing(navigation.state);
  const [isBulkDownloadQrOpen, setIsBulkDownloadQrOpen] = useState(false);

  const {
    ref: dropdownRef,
    defaultApplied,
    open,
    defaultOpen,
    setOpen,
  } = useControlledDropdownMenu();

  const selectedAssets = useAtomValue(selectedBulkItemsAtom);
  const disabled = selectedAssets.length === 0;

  const allSelected = isSelectingAllItems(selectedAssets);

  const { roles, isSelfService } = useUserRoleHelper();
  const user = useUserData();

  /**
   * Due to select all multi page selection,
   * some of the checks we do cannot be completed as we dont have the data loaded from the server.
   * As a solution for now we will handle the validation serverSide if hasSelectedAll is true
   */
  const allAssetsAreInCustody =
    allSelected ||
    selectedAssets.every((asset) => asset.status === "IN_CUSTODY");

  const allAssetsAreAvailable =
    allSelected ||
    selectedAssets.every((asset) => asset.status === "AVAILABLE");

  const someAssetCheckedOut = selectedAssets.some(
    (asset) => asset.status === "CHECKED_OUT",
  );

  const someAssetPartOfUnavailableKit = selectedAssets.some(
    (asset) => asset?.kit && asset.kit.status !== "AVAILABLE",
  );

  const selfUserCustody = selectedAssets.some((a) => {
    const primary = getPrimaryCustody(
      a?.custody as Record<string, unknown>[] | undefined,
    ) as { custodian?: { userId?: string } } | null;
    return primary?.custodian?.userId === user?.id;
  });
  const disableReleaseCustody = isSelfService && !selfUserCustody;

  function closeMenu() {
    setOpen(false);
  }

  return (
    <>
      {open && (
        <div
          className={tw(
            "fixed right-0 top-0 z-10 h-screen w-screen cursor-pointer bg-gray-700/50  transition duration-300 ease-in-out md:hidden",
          )}
        />
      )}
      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        <When
          truthy={userHasPermission({
            roles,
            entity: PermissionEntity.audit,
            action: PermissionAction.create,
          })}
        >
          <BulkStartAuditDialog />
        </When>
        <When
          truthy={userHasPermission({
            roles,
            entity: PermissionEntity.audit,
            action: PermissionAction.update,
          })}
        >
          <BulkAddToAuditDialog />
        </When>
        <BulkLocationUpdateDialog />
        <BulkCategoryUpdateDialog />
        <BulkMarkAvailabilityDialog type="available" />
        <BulkMarkAvailabilityDialog type="unavailable" />
        <BulkAddToKitDialog />
        <BulkRemoveFromKits />
      </When>

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.delete,
        })}
      >
        <BulkDeleteDialog />
      </When>

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.approve,
        })}
      >
        <BulkApproveDialog />
      </When>

      <BulkDownloadQrDialog
        isDialogOpen={isBulkDownloadQrOpen}
        onClose={() => {
          setIsBulkDownloadQrOpen(false);
        }}
      />

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.custody,
        })}
      >
        <BulkAssignCustodyDialog />
        <BulkReleaseCustodyDialog />
      </When>

      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (defaultApplied && window.innerWidth <= 640) setOpen(open);
        }}
        open={open}
        defaultOpen={defaultOpen}
      >
        <DropdownMenuTrigger
          className="actions-dropdown hidden font-medium sm:flex"
          onClick={() => setOpen(!open)}
          asChild
          disabled={disabled}
        >
          <Button
            type="button"
            variant="secondary"
            disabled={
              disabled
                ? { reason: t("bulkActions.selectAtLeastOneAsset") }
                : false
            }
          >
            <span className="flex items-center gap-2">{t("list.actions")}</span>
          </Button>
        </DropdownMenuTrigger>

        {/* using custom dropdown menu trigger on mobile which only opens dropdown not toggles menu to avoid conflicts with overlay*/}
        <Button
          variant="secondary"
          className="asset-actions flex-1 sm:hidden"
          onClick={() => setOpen(true)}
          disabled={disabled}
          type="button"
        >
          <span className="flex items-center gap-2">{t("list.actions")}</span>
        </Button>

        <MobileDropdownStyles open={open} />

        <DropdownMenuContent
          asChild
          align="end"
          className="order actions-dropdown static w-screen rounded-b-none rounded-t-[4px] bg-white p-0 text-end md:static md:w-[230px] md:rounded-t-[4px]"
          ref={dropdownRef}
        >
          <div className="order fixed bottom-0 left-0 w-screen rounded-b-none rounded-t-[4px] bg-white p-0 text-end md:static md:w-[180px] md:rounded-t-[4px]">
            <DropdownMenuItem
              onClick={() => {
                closeMenu();
                setIsBulkDownloadQrOpen(true);
              }}
              className="border-b py-1 lg:p-0"
            >
              <Button
                type="button"
                variant="link"
                className="w-full justify-start px-4  py-3 text-gray-700 hover:text-gray-700"
                width="full"
              >
                <span className="flex items-center gap-2">
                  <Icon icon="download" /> {t("bulkActions.downloadQrCodes")}
                </span>
              </Button>
            </DropdownMenuItem>
            <When
              truthy={userHasPermission({
                roles,
                entity: PermissionEntity.audit,
                action: PermissionAction.create,
              })}
            >
              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="start-audit"
                  label={t("bulkActions.createAudit")}
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
            </When>

            <When
              truthy={userHasPermission({
                roles,
                entity: PermissionEntity.audit,
                action: PermissionAction.update,
              })}
            >
              <DropdownMenuItem className="border-b py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="add-to-audit"
                  label={t("bulkActions.addToExistingAudit")}
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
            </When>

            <When
              truthy={userHasPermission({
                roles,
                entity: PermissionEntity.asset,
                action: PermissionAction.custody,
              })}
            >
              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="release-custody"
                  label={t("bulkActions.releaseCustody")}
                  onClick={closeMenu}
                  disabled={
                    !allAssetsAreInCustody ||
                    someAssetPartOfUnavailableKit ||
                    disableReleaseCustody
                      ? {
                          reason: someAssetPartOfUnavailableKit
                            ? t("bulkActions.custodyViaKitReason")
                            : disableReleaseCustody
                            ? t("bulkActions.selfServiceReleaseReason")
                            : t("bulkActions.notInCustodyReason"),
                        }
                      : isLoading
                  }
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="border-b py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="assign-custody"
                  label={
                    isSelfService
                      ? t("assetActions.takeCustody")
                      : t("bulkActions.assignCustody")
                  }
                  onClick={closeMenu}
                  disabled={
                    !allAssetsAreAvailable || someAssetPartOfUnavailableKit
                      ? {
                          reason: someAssetPartOfUnavailableKit
                            ? t("bulkActions.custodyViaKitReason")
                            : t("bulkActions.notAvailableReason"),
                        }
                      : isLoading
                  }
                />
              </DropdownMenuItem>
            </When>

            <When
              truthy={userHasPermission({
                roles,
                entity: PermissionEntity.asset,
                action: PermissionAction.approve,
              })}
            >
              <DropdownMenuItem className="border-t py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="approve"
                  onClick={closeMenu}
                  disabled={isLoading}
                  label={t("assetLifecycle.approveAction")}
                />
              </DropdownMenuItem>
            </When>

            <When
              truthy={userHasPermission({
                roles,
                entity: PermissionEntity.asset,
                action: PermissionAction.update,
              })}
            >
              <DropdownMenuItem className="border-t py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="location"
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="category"
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="border-t py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  label={t("bulkActions.addToKit")}
                  type="add-to-kit"
                  onClick={closeMenu}
                  disabled={
                    someAssetCheckedOut
                      ? {
                          reason: t("bulkActions.checkedOutAddToKitReason"),
                        }
                      : isLoading
                  }
                />
              </DropdownMenuItem>
              <DropdownMenuItem className=" py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  label={t("bulkActions.removeFromKit")}
                  type="remove-from-kit"
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="border-t py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  label={t("bulkActions.markAsAvailable")}
                  type="available"
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>
              <DropdownMenuItem className="border-b py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  label={t("bulkActions.markAsUnavailable")}
                  type="unavailable"
                  onClick={closeMenu}
                  disabled={isLoading}
                />
              </DropdownMenuItem>

              <DropdownMenuItem className="border-t md:hidden lg:p-0">
                <Button
                  type="button"
                  role="button"
                  variant="secondary"
                  className="flex items-center justify-center text-gray-700 hover:text-gray-700 "
                  width="full"
                  onClick={() => setOpen(false)}
                >
                  {t("common.close")}
                </Button>
              </DropdownMenuItem>
            </When>

            <When
              truthy={userHasPermission({
                roles,
                entity: PermissionEntity.asset,
                action: PermissionAction.delete,
              })}
            >
              <DropdownMenuItem className="border-t py-1 lg:p-0">
                <BulkUpdateDialogTrigger
                  type="trash"
                  label={t("common.delete")}
                  onClick={closeMenu}
                  disabled={
                    someAssetCheckedOut
                      ? {
                          reason: t("bulkActions.checkedOutDeleteReason"),
                        }
                      : isLoading
                  }
                />
              </DropdownMenuItem>
            </When>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
