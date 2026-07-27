import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "~/hooks/search-params";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../forms/select";

export function AvailabilitySelect({ label }: { label?: string }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const hideUnavailable = searchParams.get("hideUnavailable");

  /** Localized entity name shown in the "All …" option (defaults to assets). */
  const resolvedLabel = label ?? t("entities.asset_plural");

  /**
   * Logic:
   * 1. If no param is present, show all
   * 2. If hideUnavailable is present check if it's true or false
   */
  const defaultValue = useMemo(() => {
    if (!hideUnavailable) return "show";
    return hideUnavailable === "true" ? "hide" : "show";
  }, [hideUnavailable]);

  function handleSelectChange(value: string) {
    setSearchParams((prev) => {
      prev.set("hideUnavailable", value === "show" ? "false" : "true");
      return prev;
    });
  }

  return (
    <Select
      name="hideUnavailable"
      defaultValue={defaultValue}
      onValueChange={handleSelectChange}
    >
      <SelectTrigger
        className="text-start text-base text-gray-500 md:mt-0 md:max-w-fit"
        aria-label={t("bookings.selectAvailability")}
      >
        <SelectValue placeholder={t("bookings.selectAvailability")} />
      </SelectTrigger>

      <SelectContent
        className=" w-full min-w-[250px] p-0"
        position="popper"
        align="end"
        sideOffset={4}
      >
        <div className="max-h-[320px] overflow-auto">
          <SelectItem
            value={"show"}
            key={"show"}
            className="rounded-none border-b border-gray-200 px-6 py-4 pe-[5px]"
          >
            <span className="me-4 block lowercase text-gray-700 first-letter:uppercase">
              {t("bookings.allOfLabel", { label: resolvedLabel })}
            </span>
          </SelectItem>
          <SelectItem
            value={"hide"}
            key={"hide"}
            className="rounded-none border-b border-gray-200 px-6 py-4 pe-[5px]"
          >
            <span className="me-4 block lowercase text-gray-700 first-letter:uppercase">
              {t("bookings.hideUnavailable")}
            </span>
          </SelectItem>
        </div>
      </SelectContent>
    </Select>
  );
}
