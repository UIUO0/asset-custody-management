import { BookingStatus } from "@prisma/client";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  formatOverdueDuration,
  getLatenessMs,
} from "~/modules/booking/lateness";
import { ONE_DAY, ONE_HOUR } from "~/utils/constants";

export function TimeRemaining({
  to,
  from,
  status,
}: {
  to: Date;
  from: Date;
  status: BookingStatus;
}) {
  const { t } = useTranslation();
  const currentDate = new Date();

  // For these statuses, don't render anything (using direct comparison)
  if (
    status === BookingStatus.COMPLETE ||
    status === BookingStatus.ARCHIVED ||
    status === BookingStatus.CANCELLED
  ) {
    return null;
  }

  // For DRAFT and RESERVED, show time until start
  const isUpcoming =
    status === BookingStatus.DRAFT || status === BookingStatus.RESERVED;

  // Determine which date to use for calculation
  const targetDate = isUpcoming ? from : to;
  const remainingMs = targetDate.getTime() - currentDate.getTime();

  // Handle case where time has already passed
  if (remainingMs < 0) {
    // For OVERDUE status, show how long it's been overdue.
    // Math is delegated to the central helper for parity with the
    // Booking Compliance report — both surfaces must agree on lateness.
    if (status === BookingStatus.OVERDUE) {
      const overdueMs =
        getLatenessMs({
          status: BookingStatus.OVERDUE,
          to,
          checkInAt: null,
          now: currentDate,
        }) ?? 0;
      const {
        days: overdueDays,
        hours: overdueHours,
        minutes: overdueMinutes,
      } = formatOverdueDuration(overdueMs);

      return (
        <div className="flex items-center text-sm text-gray-600 md:ms-4 [&_span]:whitespace-nowrap">
          <Clock className="me-1 size-4 text-gray-400" />
          <span className="font-medium text-gray-900">
            {t("bookings.overdueByDays", { count: overdueDays })}
          </span>
          {overdueHours > 0 && (
            <>
              <span className="mx-1">·</span>
              <span>{t("bookings.timeHours", { count: overdueHours })}</span>
            </>
          )}
          {overdueMinutes > 0 && (
            <>
              <span className="mx-1">·</span>
              <span>
                {t("bookings.timeMinutes", { count: overdueMinutes })}
              </span>
            </>
          )}
        </div>
      );
    }

    return null; // For other statuses where time has passed, don't show anything
  }

  // Calculate time units
  const remainingDays = Math.floor(remainingMs / ONE_DAY);
  const remainingHours = Math.floor((remainingMs % ONE_DAY) / ONE_HOUR);
  const remainingMinutes = Math.floor((remainingMs % ONE_HOUR) / (1000 * 60));

  // For upcoming bookings (DRAFT, RESERVED)
  if (isUpcoming) {
    return (
      <div className="flex items-center text-sm text-gray-600 md:ms-4 [&_span]:whitespace-nowrap">
        <Clock className="me-1 size-4 text-gray-400" />
        <span className="font-medium text-gray-900">
          {t("bookings.startsInDays", { count: remainingDays })}
        </span>
        {remainingHours > 0 && (
          <>
            <span className="mx-1">·</span>
            <span>{t("bookings.timeHours", { count: remainingHours })}</span>
          </>
        )}
        {remainingMinutes > 0 && (
          <>
            <span className="mx-1">·</span>
            <span>
              {t("bookings.timeMinutes", { count: remainingMinutes })}
            </span>
          </>
        )}
      </div>
    );
  }

  // For ONGOING status
  return (
    <div className="flex items-center text-sm text-gray-600 md:ms-4 [&_span]:whitespace-nowrap">
      <Clock className="me-1 size-4 text-gray-400" />
      <span className="font-medium text-gray-900">
        {t("bookings.timeDays", { count: remainingDays })}
      </span>
      {remainingHours > 0 && (
        <>
          <span className="mx-1">·</span>
          <span>{t("bookings.timeHours", { count: remainingHours })}</span>
        </>
      )}
      {remainingMinutes > 0 && (
        <>
          <span className="mx-1">·</span>
          <span>{t("bookings.timeMinutes", { count: remainingMinutes })}</span>
        </>
      )}
      <span className="ms-1">{t("bookings.remaining")}</span>
    </div>
  );
}
