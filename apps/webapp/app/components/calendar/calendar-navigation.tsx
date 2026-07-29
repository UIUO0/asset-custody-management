import type { RefObject } from "react";
import type FullCalendar from "@fullcalendar/react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../shared/button";
import { ButtonGroup } from "../shared/button-group";

export function CalendarNavigation({
  calendarRef,
  updateTitle,
}: {
  calendarRef: RefObject<FullCalendar | null>;
  updateTitle: () => void;
}) {
  const { t } = useTranslation();
  function handleCalendarNavigation(navigateTo: "prev" | "today" | "next") {
    const calendarApi = calendarRef.current?.getApi();
    if (navigateTo === "prev") {
      calendarApi?.prev();
    } else if (navigateTo == "next") {
      calendarApi?.next();
    } else if (navigateTo == "today") {
      calendarApi?.gotoDate(new Date());
    }

    updateTitle();
  }

  return (
    <div className="me-4">
      <ButtonGroup>
        <Button
          type="button"
          variant="secondary"
          className="border-r p-[0.7em] text-gray-500"
          onClick={() => handleCalendarNavigation("prev")}
          aria-label={t("ui.previousMonth")}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="border-r px-3 py-2 text-sm font-semibold text-gray-700"
          onClick={() => handleCalendarNavigation("today")}
          tooltip={t("ui.goToToday")}
        >
          {t("reports.timeframeToday")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="p-[0.7em] text-gray-500"
          onClick={() => handleCalendarNavigation("next")}
          aria-label={t("ui.nextMonth")}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </ButtonGroup>
    </div>
  );
}
