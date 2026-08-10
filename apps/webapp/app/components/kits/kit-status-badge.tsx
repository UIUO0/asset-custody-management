import { KitStatus } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { BADGE_COLORS, type BadgeColorScheme } from "~/utils/badge-colors";
import { Badge } from "../shared/badge";

/**
 * Maps a kit status to the i18n key of its user-facing label.
 *
 * Returns a key rather than a translated string because this is a plain helper
 * (no React context), so it cannot call the `useTranslation` hook. Callers
 * resolve the key with `t()`.
 *
 * @param status - The kit status
 * @returns The i18n key for the status label
 */
export function userFriendlyKitStatus(status: KitStatus) {
  switch (status) {
    case KitStatus.IN_CUSTODY:
      return "kits.statusInCustody";
    case KitStatus.CHECKED_OUT:
      return "kits.statusCheckedOut";
    default:
      return "kits.statusAvailable";
  }
}

export const kitStatusColorMap = (status: KitStatus): BadgeColorScheme => {
  switch (status) {
    case KitStatus.IN_CUSTODY:
      return BADGE_COLORS.blue;
    case KitStatus.CHECKED_OUT:
      return BADGE_COLORS.violet;
    default:
      // AVAILABLE
      return BADGE_COLORS.green;
  }
};

/**
 * The kit's status, as a badge.
 *
 * It used to carry a second "not available for bookings" badge driven by
 * `availableToBook`. That badge told a user in a system with no bookings that
 * something could not be booked — a warning about an action nobody can take.
 * The column itself is kept (see CLAUDE.md), but nothing renders it any more.
 *
 * @param status - The kit's persisted status
 */
export function KitStatusBadge({ status }: { status: KitStatus }) {
  const { t } = useTranslation();
  const colors = kitStatusColorMap(status);

  return (
    <Badge color={colors.bg} textColor={colors.text}>
      {t(userFriendlyKitStatus(status))}
    </Badge>
  );
}
