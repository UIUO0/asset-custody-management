import { BookingStatus } from "@prisma/client";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useNavigation } from "react-router";
import { useHydrated } from "remix-utils/use-hydrated";
import { selectedBulkItemsAtom } from "~/atoms/list";
import { useControlledDropdownMenu } from "~/hooks/use-controlled-dropdown-menu";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { isBookingArchivable } from "~/modules/booking/helpers";
import { isFormProcessing } from "~/utils/form";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { tw } from "~/utils/tw";
import BulkArchiveDialog from "./bulk-archive-dialog";
import BulkCancelDialog from "./bulk-cancel-dialog";
import BulkDeleteDialog from "./bulk-delete-dialog";
import { BulkUpdateDialogTrigger } from "../bulk-update-dialog/bulk-update-dialog";
import { ChevronRight } from "../icons/library";
import { Button } from "../shared/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../shared/dropdown";
import { MobileDropdownStyles } from "../shared/mobile-dropdown-styles";

export default function BulkActionsDropdown() {
  const { t } = useTranslation();
  const isHydrated = useHydrated();

  if (!isHydrated) {
    return (
      <Button variant="secondary" to="#">
        <span className="flex items-center gap-2">
          {t("common.actions")} <ChevronRight className="chev rotate-90" />
        </span>
      </Button>
    );
  }

  return (
    <div className="actions-dropdown flex flex-1 justify-end">
      <ConditionalDropdown />
    </div>
  );
}

function ConditionalDropdown() {
  const { t } = useTranslation();
  const selectedBookings = useAtomValue(selectedBulkItemsAtom);

  const someBookingInDraft = selectedBookings.some(
    (booking) => booking.status === "DRAFT",
  );

  /**
   * Archive is enabled only when every selected booking is archivable —
   * COMPLETE, or a RESERVED booking whose end date has passed. The server
   * re-checks via {@link isBookingArchivable}; this is the matching UI gate.
   */
  const allBookingsArchivable =
    selectedBookings.length > 0 &&
    selectedBookings.every((b) =>
      isBookingArchivable({ status: b.status, to: b.to }),
    );

  const cancelIsDisabled = selectedBookings.some((b) =>
    [
      BookingStatus.ARCHIVED,
      BookingStatus.CANCELLED,
      BookingStatus.COMPLETE,
      BookingStatus.DRAFT,
    ].includes(b.status as any),
  );

  const { isBase, roles } = useUserRoleHelper();

  const navigation = useNavigation();
  const isLoading = isFormProcessing(navigation.state);

  const disabled = selectedBookings.length === 0;

  const canArchiveBooking = userHasPermission({
    roles,
    entity: PermissionEntity.booking,
    action: PermissionAction.archive,
  });

  const archiveDisabled = !allBookingsArchivable || !canArchiveBooking;

  /**
   * Base users dont have permissions to delete bookings unless they are draft.
   * The permission check is what stops the read-only operational roles
   * (FINANCE, INVENTORY) from being offered a delete the server would refuse —
   * the `isBase` clause alone let every non-BASE role through.
   */
  const canDeleteBooking = userHasPermission({
    roles,
    entity: PermissionEntity.booking,
    action: PermissionAction.delete,
  });
  const deleteDisabled =
    !canDeleteBooking || (isBase && !someBookingInDraft) || isBase || isLoading;

  const {
    ref: dropdownRef,
    defaultApplied,
    open,
    defaultOpen,
    setOpen,
  } = useControlledDropdownMenu();

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

      <BulkDeleteDialog />
      <BulkArchiveDialog />
      <BulkCancelDialog />

      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (defaultApplied && window.innerWidth <= 640) setOpen(open);
        }}
        open={open}
        defaultOpen={defaultOpen}
      >
        <DropdownMenuTrigger
          className="actions-dropdown hidden sm:flex"
          onClick={() => setOpen(!open)}
          asChild
          disabled={disabled}
        >
          <Button type="button" variant="secondary">
            <span className="flex items-center gap-2">
              {t("common.actions")}
            </span>
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
          <span className="flex items-center gap-2">{t("common.actions")}</span>
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
              className="px-4 py-1 md:p-0"
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              <BulkUpdateDialogTrigger
                type="cancel"
                label={t("common.cancel")}
                onClick={closeMenu}
                disabled={
                  cancelIsDisabled
                    ? {
                        reason: t("bookings.bulkCancelDisabledReason"),
                      }
                    : isLoading
                }
              />
            </DropdownMenuItem>

            <DropdownMenuItem
              className="px-4 py-1 md:p-0"
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              <BulkUpdateDialogTrigger
                type="archive"
                label={t("bookings.archive")}
                disabled={
                  archiveDisabled
                    ? {
                        reason: t("bookings.bulkArchiveDisabledReason"),
                      }
                    : isLoading
                }
                onClick={closeMenu}
              />
            </DropdownMenuItem>

            <DropdownMenuItem
              className="px-4 py-1 md:p-0"
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              <BulkUpdateDialogTrigger
                type="trash"
                label={t("common.delete")}
                onClick={closeMenu}
                disabled={
                  deleteDisabled
                    ? {
                        reason: t("bookings.bulkDeleteDisabledReason"),
                      }
                    : isLoading
                }
              />
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
