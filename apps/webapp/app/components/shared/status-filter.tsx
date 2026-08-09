/**
 * Generic status <select> filter.
 *
 * Lived under `components/booking/` for historical reasons only — it has no
 * booking coupling whatsoever, and audits, the team directory, kits, locations
 * and asset notes all use it. Moved here when bookings were removed so the
 * component outlived the folder it happened to sit in.
 */
import { useTranslation } from "react-i18next";
import { useNavigation } from "react-router";
import { useSearchParams } from "~/hooks/search-params";
import { isFormProcessing } from "~/utils/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../forms/select";

// Base props that are always available
type BaseStatusFilterProps = {
  statusItems: Record<string, string>;
  name?: string;
};

// When defaultValue is provided, onValueChange is required
type StatusFilterWithCustomDefault = BaseStatusFilterProps & {
  defaultValue: string;
  onValueChange: (value: string) => void;
};

// When defaultValue is not provided, onValueChange is optional (uses internal handler)
type StatusFilterWithDefaultBehavior = BaseStatusFilterProps & {
  defaultValue?: never;
  onValueChange?: never;
};

// Union type for the component props
type StatusFilterProps =
  | StatusFilterWithCustomDefault
  | StatusFilterWithDefaultBehavior;

export function StatusFilter(props: StatusFilterProps) {
  const { statusItems, name = "status", defaultValue, onValueChange } = props;
  const { t } = useTranslation();
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get(name);

  function localHandleValueChange(value: string) {
    setSearchParams((prev) => {
      /** If the value is "ALL", we just remove the param */
      if (value === "ALL") {
        prev.delete(name);
      } else {
        prev.set(name, value);
      }
      /**
       * Reset pagination when the filter changes — otherwise a stale `page`
       * offset can land on an empty page (e.g. switching to a filter whose
       * results all fit on page 1). Mirrors the search and per-page controls.
       */
      prev.delete("page");
      return prev;
    });
  }

  // Use custom handler if provided, otherwise use local handler
  const handleValueChange = onValueChange || localHandleValueChange;

  // Use custom default if provided, otherwise use "ALL"
  const effectiveDefaultValue = defaultValue || "ALL";

  return (
    <div className="w-full md:w-auto">
      <Select
        name={name}
        defaultValue={status ? status : effectiveDefaultValue}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label={t("list.filterByStatus")}
          className="mt-2 px-3.5 py-2 text-start text-base text-gray-500 md:mt-0 md:max-w-fit"
        >
          <SelectValue placeholder={t("list.filterByStatus")} />
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="w-full min-w-[300px] p-0"
          align="start"
        >
          <div className=" max-h-[320px] overflow-auto">
            {["ALL", ...Object.values(statusItems)].map((value) => (
              <SelectItem
                value={value}
                key={value}
                className="rounded-none border-b border-gray-200 px-6 py-4 pe-[5px]"
              >
                {/* why: enum values are translated via the `status`
                    namespace; the humanised enum is the fallback so a
                    status added later still renders readably. */}
                <span className="me-4 block text-[14px] text-gray-700">
                  {t(`status.${value}`, value.split("_").join(" "))}
                </span>
              </SelectItem>
            ))}
          </div>
        </SelectContent>
      </Select>
    </div>
  );
}
