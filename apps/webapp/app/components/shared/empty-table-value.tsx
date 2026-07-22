import type { HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

import { tw } from "~/utils/tw";

export function EmptyTableValue({
  label,
  symbol = "—",
  className,
  ...rest
}: {
  label?: string;
  symbol?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  const { t } = useTranslation();
  /** Localised default — callers may still pass an explicit label. */
  const resolvedLabel = label ?? t("list.noData");
  return (
    <span
      aria-label={resolvedLabel}
      className={tw(
        "inline-flex items-center text-sm text-gray-400",
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true">{symbol}</span>
      <span className="sr-only">{resolvedLabel}</span>
    </span>
  );
}
