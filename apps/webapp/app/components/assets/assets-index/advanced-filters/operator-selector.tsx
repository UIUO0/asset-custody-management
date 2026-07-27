import type { KeyboardEvent } from "react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "~/components/icons/library";
import type { DisabledProp } from "~/components/shared/button";
import { Button } from "~/components/shared/button";
import { handleActivationKeyPress } from "~/utils/keyboard";
import { tw } from "~/utils/tw";
import type { Filter, FilterDefinition, FilterOperator } from "./schema";

function FilterOperatorDisplay({
  symbol,
  text,
}: {
  symbol: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[14px] ">
      <span className="font-semibold text-gray-500">{symbol}</span>
      <span className=" whitespace-nowrap font-normal">{text}</span>
    </div>
  );
}

/**
 * Maps each {@link FilterOperator} to its `[symbol, labelKey]` pair.
 *
 * The second entry is an **i18n key**, not display copy — the map lives at
 * module scope where the `useTranslation` hook is unavailable, so consumers
 * resolve it with `t()` (or the `translate` callback threaded through
 * `formatFilterSummary`) at render time.
 */
export const operatorsMap: Record<FilterOperator, string[]> = {
  is: ["=", "filterOperators.is"],
  isNot: ["≠", "filterOperators.isNot"],
  contains: ["∋", "filterOperators.contains"],
  before: ["<", "filterOperators.before"],
  after: [">", "filterOperators.after"],
  between: ["<>", "filterOperators.between"],
  gt: [">", "filterOperators.gt"],
  lt: ["<", "filterOperators.lt"],
  gte: [">=", "filterOperators.gte"],
  lte: ["<=", "filterOperators.lte"],
  in: ["∈", "filterOperators.in"],
  containsAll: ["⊇", "filterOperators.containsAll"],
  containsAny: ["⊃", "filterOperators.containsAny"],
  matchesAny: ["≈", "filterOperators.matchesAny"],
  inDates: ["∈", "filterOperators.inDates"],
  excludeAny: ["⊄", "filterOperators.excludeAny"], // clear meaning for tag exclusion
  withinHierarchy: ["↳", "filterOperators.withinHierarchy"],
};

// Define the allowed operators for each field type
export const operatorsPerType: FilterDefinition = {
  string: ["is", "isNot", "contains", "matchesAny", "containsAny"],
  text: ["contains", "matchesAny", "containsAny"],
  boolean: ["is"],
  date: ["is", "isNot", "before", "after", "between", "inDates"],
  number: ["is", "isNot", "gt", "lt", "gte", "lte", "between"],
  amount: ["is", "isNot", "gt", "lt", "gte", "lte", "between"],
  enum: ["is", "isNot", "containsAny", "withinHierarchy"],
  array: ["contains", "containsAll", "containsAny", "excludeAny"],
  customField: [], // empty array as customField operators are determined by the actual field type
};

export function OperatorSelector({
  filter,
  setFilter,
  disabled,
}: {
  filter: Filter;
  setFilter: (filter: Filter["operator"]) => void;
  disabled?: DisabledProp;
}) {
  const { t } = useTranslation();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // `filter.operator` is the source of truth from props; derive directly to avoid
  // a redundant useState/useEffect pair.
  const operator: FilterOperator | undefined = filter.operator;

  /** Get the correct operators, based on the field type */
  const baseOperators = operatorsPerType[filter.type];
  const locationOperatorOrder: FilterOperator[] = [
    "is",
    "withinHierarchy",
    "containsAny",
    "isNot",
  ];
  /** Tracking type only has 2 values — restrict to is/isNot */
  const typeOnlyOperators: FilterOperator[] = ["is", "isNot"];
  const operators =
    filter.name === "location"
      ? locationOperatorOrder.filter((op) => baseOperators.includes(op))
      : filter.name === "type"
      ? typeOnlyOperators
      : baseOperators.filter((op) => op !== "withinHierarchy");

  /** Scroll an option index into view inside the popover list. */
  const scrollIndexIntoView = (index: number) => {
    const selectedElement = document.getElementById(`operator-option-${index}`);
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  };

  /**
   * Handle popover open/close. When opening, seed the highlighted index to the
   * currently-selected operator. Previously this was a useEffect firing on
   * `isPopoverOpen` — now it's colocated with the event that triggers it.
   */
  const handleOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (open) {
      const currentIndex = operators.findIndex((op) => op === operator);
      const nextIndex = currentIndex >= 0 ? currentIndex : 0;
      setSelectedIndex(nextIndex);
      // Scroll after the popover has rendered its content.
      setTimeout(() => scrollIndexIntoView(nextIndex), 0);
    }
  };

  const handleSelect = (operatorToSelect: FilterOperator) => {
    setFilter(operatorToSelect);
    setIsPopoverOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev < operators.length - 1 ? prev + 1 : prev;
          scrollIndexIntoView(next);
          return next;
        });
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : prev;
          scrollIndexIntoView(next);
          return next;
        });
        break;
      case "Enter":
      case " ": // Space key
        event.preventDefault();
        handleSelect(operators[selectedIndex] as FilterOperator);
        break;
      case "Escape":
        event.preventDefault();
        setIsPopoverOpen(false);
        break;
    }
  };

  return operator ? (
    <Popover open={isPopoverOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          title={t(operatorsMap[operator][1])}
          className="w-[62px] font-normal"
          disabled={disabled}
        >
          <span className="flex items-center gap-3">
            <ChevronRight className="mt-px inline-block rotate-90 text-gray-600" />
            <span className="ms-[6px]">{operatorsMap[operator][0]}</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          className={tw(
            "z-[999999]  mt-2  rounded-md border border-gray-200 bg-white",
          )}
          onKeyDown={handleKeyDown}
        >
          {operators.map((operator, index) => {
            const k = operator as FilterOperator;
            const v = operatorsMap[k];
            return (
              <div
                id={`operator-option-${index}`}
                key={k + index}
                className={tw(
                  "px-4 py-2 text-[14px] font-medium text-gray-600 hover:cursor-pointer hover:bg-gray-50",
                  selectedIndex === index && "bg-gray-50",
                )}
                role="option"
                aria-selected={selectedIndex === index}
                tabIndex={0}
                onClick={() => handleSelect(k as FilterOperator)}
                onKeyDown={handleActivationKeyPress(() =>
                  handleSelect(k as FilterOperator),
                )}
              >
                <FilterOperatorDisplay symbol={v[0]} text={t(v[1])} />
              </div>
            );
          })}
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  ) : null;
}
