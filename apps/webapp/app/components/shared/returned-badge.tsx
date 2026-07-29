import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BADGE_COLORS } from "~/utils/badge-colors";
import { Badge } from "./badge";

export function ReturnedBadge() {
  const { t } = useTranslation();
  const colors = BADGE_COLORS.gray;
  return (
    <Badge color={colors.bg} textColor={colors.text} withDot={false}>
      <span className="inline-flex items-center">
        <Check className="me-1 size-3.5" style={{ color: colors.text }} />
        {t("bookings.legendReturned")}
      </span>
    </Badge>
  );
}
