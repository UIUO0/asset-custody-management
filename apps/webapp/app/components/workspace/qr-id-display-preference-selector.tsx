import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { QrIdDisplayPreference } from "@prisma/client";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AssetCodeBadge } from "~/components/assets/asset-code-badge";
import { handleActivationKeyPress } from "~/utils/keyboard";
import { tw } from "~/utils/tw";
import When from "../when/when";

type QrIdDisplayPreferenceSelectorProps = {
  className?: string;
  defaultValue: QrIdDisplayPreference;
  name?: string;
  /**
   * When true, barcode-type options (Code128, Code39, DataMatrix, ExternalQR,
   * EAN13) are appended to the list. Reflects `Organization.barcodesEnabled`.
   */
  canUseBarcodes?: boolean;
};

type Option = {
  value: QrIdDisplayPreference;
  /** i18n key for the option label — resolved with `t()` at render time. */
  labelKey: string;
  /** i18n key for the option description. */
  descriptionKey: string;
  /**
   * Synthetic value used by the inline AssetCodeBadge preview chip — gives the
   * user a feel for what their list rows will look like once they save. Kept
   * in sync with the `(e.g., …)` example baked into `description` so the chip
   * and the dropdown row never tell different stories.
   */
  exampleValue: string;
};

/** Options always available — QR id and SAM id work without the barcode add-on. */
const BASE_OPTIONS: Option[] = [
  {
    value: "QR_ID",
    labelKey: "barcodePreference.qrCodeId",
    descriptionKey: "barcodePreference.qrCodeIdDesc",
    exampleValue: "abc123xyz",
  },
  {
    value: "SAM_ID",
    labelKey: "barcodePreference.samId",
    descriptionKey: "barcodePreference.samIdDesc",
    exampleValue: "SAM-0001",
  },
];

/** Barcode-type options — gated behind Organization.barcodesEnabled. */
const BARCODE_OPTIONS: Option[] = [
  {
    value: "Code128",
    labelKey: "barcodePreference.code128",
    descriptionKey: "barcodePreference.code128Desc",
    exampleValue: "ABC-123",
  },
  {
    value: "Code39",
    labelKey: "barcodePreference.code39",
    descriptionKey: "barcodePreference.code39Desc",
    exampleValue: "ABC123",
  },
  {
    value: "DataMatrix",
    labelKey: "barcodePreference.dataMatrix",
    descriptionKey: "barcodePreference.dataMatrixDesc",
    exampleValue: "ABC-123",
  },
  {
    value: "ExternalQR",
    labelKey: "barcodePreference.externalQr",
    descriptionKey: "barcodePreference.externalQrDesc",
    exampleValue: "https://example.com",
  },
  {
    value: "EAN13",
    labelKey: "barcodePreference.ean13",
    descriptionKey: "barcodePreference.ean13Desc",
    exampleValue: "9780201379624",
  },
];

export default function QrIdDisplayPreferenceSelector({
  className,
  defaultValue,
  name,
  canUseBarcodes = false,
}: QrIdDisplayPreferenceSelectorProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Available options depend on the org's barcode add-on. Computed once per
  // mount since `canUseBarcodes` reflects a server-known org-level setting.
  const availableOptions = useMemo<Option[]>(
    () =>
      canUseBarcodes ? [...BASE_OPTIONS, ...BARCODE_OPTIONS] : BASE_OPTIONS,
    [canUseBarcodes],
  );

  const [isOpen, setIsOpen] = useState(false);
  // Lazy initializer avoids a false-positive derived-state lint: after mount this
  // state is user-controlled via the selector, so it must NOT re-sync with the prop.
  const [selectedPreference, setSelectedPreference] = useState(
    () => defaultValue,
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(() =>
    Math.max(
      0,
      availableOptions.findIndex((option) => option.value === defaultValue),
    ),
  );

  const [searchQuery, setSearchQuery] = useState("");

  const filteredOptions = useMemo(() => {
    if (!searchQuery) {
      return availableOptions;
    }

    return availableOptions.filter(
      (option) =>
        t(option.labelKey).toLowerCase().includes(searchQuery.toLowerCase()) ||
        t(option.descriptionKey)
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, availableOptions]);

  // Keep `selectedIndex` aligned with the currently-resolved selection in the
  // filtered list. Without this, the index is seeded once at mount but never
  // updated when the user picks an option (via `handleSelect`), types in the
  // search box (shrinking `filteredOptions`), or `availableOptions` changes
  // mid-mount. Keyboard navigation then operates on a stale index — pressing
  // Enter could select a different row than the one visually highlighted.
  // Falls back to 0 when the current selection isn't in the filtered set so
  // arrow keys always land somewhere sensible.
  useEffect(() => {
    const idx = filteredOptions.findIndex(
      (option) => option.value === selectedPreference,
    );
    setSelectedIndex(idx >= 0 ? idx : 0);
  }, [selectedPreference, filteredOptions]);

  function handleSelect(preference: QrIdDisplayPreference) {
    setSelectedPreference(preference);
    setIsOpen(false);
  }

  // Ensure selected item is visible in viewport
  const scrollToIndex = (index: number) => {
    setTimeout(() => {
      const selectedElement = document.getElementById(
        `qr-preference-option-${index}`,
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }, 0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((prev) => {
          const newIndex = prev < filteredOptions.length - 1 ? prev + 1 : prev;
          scrollToIndex(newIndex);
          return newIndex;
        });
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((prev) => {
          const newIndex = prev > 0 ? prev - 1 : prev;
          scrollToIndex(newIndex);
          return newIndex;
        });
        break;
      case "Enter":
        event.preventDefault();
        if (filteredOptions[selectedIndex]) {
          setSelectedPreference(filteredOptions[selectedIndex].value);
          setIsOpen(false);
        }
        break;
    }
  };

  const selectedOption =
    availableOptions.find((option) => option.value === selectedPreference) ??
    // Defensive: data drift (e.g., addon revoked while org had a Code128 pref
    // saved). Fall back to QR_ID for the UI label; the resolver also falls back.
    BASE_OPTIONS[0];

  return (
    // w-full so the trigger matches the width of sibling form controls
    // (Currency dropdown, Name input). Without it the flex-col container
    // shrinks to its largest child's natural width, and the inner button's
    // `w-full` only fills that shrunk column — narrower than the FormRow slot.
    <div className="flex w-full flex-col gap-2">
      <Popover
        open={isOpen}
        onOpenChange={(v) => {
          if (v) {
            scrollToIndex(selectedIndex);
          }
          setIsOpen(v);
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            // type="button" required by `local-rules/require-button-type` —
            // without it the native default is "submit", and this dropdown
            // trigger sits inside a `fetcher.Form` (workspace edit form).
            // Clicking to OPEN the dropdown would otherwise submit the form.
            type="button"
            // text-start overrides the browser default of `text-align: center`
            // on <button>; without it the multi-line label+description
            // appears centered when text wraps. min-h-[44px] keeps visual
            // parity with sibling form controls while allowing the two-row
            // content to set the actual height.
            className={tw(
              "flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-start",
              className,
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-gray-900">
                {selectedOption ? t(selectedOption.labelKey) : null}
              </span>
              <span className="truncate text-xs text-gray-500">
                {selectedOption ? t(selectedOption.descriptionKey) : null}
              </span>
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-gray-500" />
            {/*
              Submit the *resolved* selectedOption.value rather than the raw
              selectedPreference. If the saved preference is no longer in
              availableOptions (e.g., the addon was revoked while a Code128
              pref remained in the DB), `selectedOption` falls back to
              BASE_OPTIONS[0] for the visible label — and this hidden input
              must match what the user actually sees, otherwise the form
              quietly persists the stale value.
            */}
            <input type="hidden" name={name} value={selectedOption.value} />
          </button>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            className="z-[999999] max-h-[400px] overflow-scroll rounded-md border bg-white"
            side="bottom"
            style={{ width: triggerRef?.current?.clientWidth }}
          >
            <div className="flex items-center border-b">
              <SearchIcon className="ms-4 size-4 text-gray-500" />
              <input
                placeholder={t("barcodePreference.searchOptions")}
                className="border-0 px-4 py-2 ps-2 text-[14px] focus:border-0 focus:ring-0"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                }}
                onKeyDown={handleKeyDown}
                // a11y: WCAG 2.1 AA requires every form input to have an
                // accessible name. The placeholder alone is not a substitute
                // for screen readers — `aria-label` gives the same visible
                // text a non-visual equivalent.
                aria-label={t("barcodePreference.searchPreferences")}
              />
            </div>
            {filteredOptions.map((option, index) => {
              // Resolve "is this the selected row?" off the *resolved*
              // selectedOption.value (matches the trigger label, the hidden
              // input, and the preview chip). Using the raw selectedPreference
              // would, in the addon-revoked drift case, leave the popover
              // with no visibly selected row even though the component is
              // effectively on the fallback option.
              const isSelected = selectedOption.value === option.value;
              const isHovered = selectedIndex === index;

              return (
                <div
                  id={`qr-preference-option-${index}`}
                  key={option.value}
                  // items-start aligns the check icon to the top of the row
                  // so it stays anchored next to the label (not floating to
                  // the vertical center of the two-line content).
                  className={tw(
                    "flex items-start justify-between gap-3 px-4 py-3 hover:cursor-pointer hover:bg-gray-50",
                    isHovered && "bg-gray-50",
                  )}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => {
                    handleSelect(option.value);
                  }}
                  onKeyDown={handleActivationKeyPress(() =>
                    handleSelect(option.value),
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-gray-900">
                      {t(option.labelKey)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {t(option.descriptionKey)}
                    </span>
                  </div>
                  <When truthy={isSelected}>
                    <CheckIcon className="size-4 shrink-0 text-primary" />
                  </When>
                </div>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="px-4 py-2 text-sm text-gray-500">
                {t("assets.noOptionsFound")}
              </div>
            )}
          </PopoverContent>
        </PopoverPortal>
      </Popover>

      {/*
      Live preview chip — renders the exact AssetCodeBadge users will see on
      every list view once they save. Updates instantly as they change the
      dropdown selection, so "Preferred display code" stops being abstract
      copy and becomes "this is literally what shows up on every row."
      Synthetic example value (defined per-option above) — no live data needed.
    */}
      <div
        className="flex items-center gap-2 text-xs text-gray-500"
        aria-live="polite"
      >
        <span>{t("barcodePreference.rowsWillLookLike")}</span>
        <AssetCodeBadge
          value={selectedOption.exampleValue}
          // Drive the preview off the RESOLVED `selectedOption.value`, not the
          // raw `selectedPreference` state. If the saved pref is no longer in
          // availableOptions (e.g., addon revoked while a Code128 pref
          // remained in the DB), `selectedOption` falls back to BASE_OPTIONS[0]
          // for the button label + hidden input; the preview chip must follow
          // suit so all three places show the same thing.
          type={selectedOption.value}
          isFallback={false}
          workspacePreference={selectedOption.value}
        />
      </div>
    </div>
  );
}
