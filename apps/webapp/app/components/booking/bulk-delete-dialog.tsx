import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { selectedBulkItemsAtom } from "~/atoms/list";
import type { BookingsIndexLoaderData } from "~/routes/_layout+/bookings._index";
import { isSelectingAllItems } from "~/utils/list";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

export const BulkDeleteBookingSchema = z.object({
  bookingIds: z.array(z.string()).min(1),
});

export default function BulkDeleteDialog() {
  const { t } = useTranslation();
  const { totalItems } = useLoaderData<BookingsIndexLoaderData>();

  const zo = useZorm("BulkDeleteBookings", BulkDeleteBookingSchema);

  const selectedBookings = useAtomValue(selectedBulkItemsAtom);

  const totalSelected = isSelectingAllItems(selectedBookings)
    ? totalItems
    : selectedBookings.length;

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="trash"
      arrayFieldId="bookingIds"
      actionUrl="/api/bookings/bulk-actions"
      title={t("bookings.bulkDeleteTitle", { count: totalSelected })}
      description={t("bookings.bulkDeleteDescription", {
        count: totalSelected,
      })}
    >
      {({ fetcherError, disabled, handleCloseDialog }) => (
        <>
          <input type="hidden" value="bulk-delete" name="intent" />

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
              className="border-error-600 bg-error-600 hover:border-error-800 hover:bg-error-800"
            >
              {t("common.confirm")}
            </Button>
          </div>
        </>
      )}
    </BulkUpdateDialogContent>
  );
}
