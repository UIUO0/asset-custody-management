import type { ReactNode } from "react";
import { BookingStatus } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { useUserData } from "~/hooks/use-user-data";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { bookingStatusColorMap } from "~/utils/bookings";
import { Badge } from "../shared/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../shared/tooltip";

export function BookingStatusBadge({
  status,
  custodianUserId,
}: {
  status: BookingStatus;
  /** Id of the custodian if it's a user */
  custodianUserId: string | undefined;
}) {
  const { t } = useTranslation();
  const { isBase } = useUserRoleHelper();
  const user = useUserData();

  /**
   * This is used to show the extra info tooltip when the booking is
   * reserved and the user is the custodian of the booking.
   * This is only shown for base users.
   */
  const shouldShowExtraInfo =
    isBase &&
    status === BookingStatus.RESERVED &&
    custodianUserId &&
    custodianUserId === user?.id;

  const colors = bookingStatusColorMap[status];
  // why: the raw Prisma enum used to be rendered directly (hence the
  // `lowercase first-letter:uppercase` casing hack). Translations are already
  // correctly cased in both locales, so no text-transform is applied.
  const statusLabel = t(`status.${status}`);

  return (
    <Badge color={colors.bg} textColor={colors.text} withDot={false}>
      {shouldShowExtraInfo ? (
        <ExtraInfoTooltip>
          <span className="block whitespace-nowrap">
            {statusLabel} - {t("bookings.subjectToReview")}
          </span>
        </ExtraInfoTooltip>
      ) : (
        <span className="block whitespace-nowrap">{statusLabel}</span>
      )}
    </Badge>
  );
}

/**
 * Tooltip explaining that a RESERVED booking can still be rejected or closed
 * by an admin. Rendered only for base users viewing their own booking.
 *
 * @param children - The badge label the tooltip is anchored to
 */
function ExtraInfoTooltip({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>{children}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-72">
          <p>{t("bookings.reservedSubjectToReviewTooltip")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
