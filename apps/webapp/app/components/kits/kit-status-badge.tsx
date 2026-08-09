import { KitStatus } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { ExtendedKitStatus } from "~/utils/asset-status";
import { BADGE_COLORS, type BadgeColorScheme } from "~/utils/badge-colors";
import { Badge } from "../shared/badge";
import { UnavailableBadge } from "../shared/unavailable-badge";

/**
 * Maps a kit status to the i18n key of its user-facing label.
 *
 * Returns a key rather than a translated string because this is a plain helper
 * (no React context), so it cannot call the `useTranslation` hook. Callers
 * resolve the key with `t()`.
 *
 * @param status - The kit status (including the derived `PARTIALLY_CHECKED_IN`)
 * @returns The i18n key for the status label
 */
export function userFriendlyKitStatus(status: ExtendedKitStatus) {
  switch (status) {
    case KitStatus.IN_CUSTODY:
      return "kits.statusInCustody";
    case KitStatus.CHECKED_OUT:
      return "kits.statusCheckedOut";
    case "PARTIALLY_CHECKED_IN":
      return "kits.statusPartiallyCheckedIn";
    default:
      return "kits.statusAvailable";
  }
}

export const kitStatusColorMap = (
  status: ExtendedKitStatus,
): BadgeColorScheme => {
  switch (status) {
    case KitStatus.IN_CUSTODY:
      return BADGE_COLORS.blue;
    case "PARTIALLY_CHECKED_IN":
      return BADGE_COLORS.blue;
    case KitStatus.CHECKED_OUT:
      return BADGE_COLORS.violet;
    default:
      // AVAILABLE
      return BADGE_COLORS.green;
  }
};

export function KitStatusBadge({
  status,
  availableToBook = true,
}: {
  status: ExtendedKitStatus;
  availableToBook: boolean;
}) {
  const { t } = useTranslation();
  const colors = kitStatusColorMap(status);
  return (
    <div className="flex items-center gap-[6px]">
      <Badge color={colors.bg} textColor={colors.text}>
        {t(userFriendlyKitStatus(status))}
      </Badge>
      {!availableToBook && (
        <UnavailableBadge
          title={t("ui.thisKitIsNotAvailableForBookingsBecauseSomeO")}
        />
      )}
    </div>
  );
}
