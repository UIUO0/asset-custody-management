import { Close } from "@radix-ui/react-dialog";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, ClockIcon, InfoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tw } from "~/utils/tw";
import { XIcon } from "../icons/library";
import { Button } from "../shared/button";
import { Sheet, SheetContent, SheetTrigger } from "../shared/sheet";

type BookingProcessSidebarProps = {
  className?: string;
};

type ProcessItem = {
  /** Stable id used as React key when rendering the list. */
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  iconClassName: string;
};

export default function BookingProcessSidebar({
  className,
}: BookingProcessSidebarProps) {
  const { t } = useTranslation();

  const ITEMS: Array<ProcessItem> = [
    {
      id: "submit-request",
      icon: ClockIcon,
      title: t("bookings.processSubmitTitle"),
      description: t("bookings.processSubmitDesc"),
      iconClassName: "bg-blue-100 text-blue-500",
    },
    {
      id: "admin-review",
      icon: InfoIcon,
      title: t("bookings.processReviewTitle"),
      description: t("bookings.processReviewDesc"),
      iconClassName: "bg-warning-100 text-warning-500",
    },
    {
      id: "check-out",
      icon: ArrowRight,
      title: t("bookings.processCheckoutTitle"),
      description: t("bookings.processCheckoutDesc"),
      iconClassName: "bg-violet-100 text-violet-500",
    },
    {
      id: "check-in",
      icon: ArrowLeft,
      title: t("bookings.processCheckinTitle"),
      description: t("bookings.processCheckinDesc"),
      iconClassName: "bg-indigo-100 text-indigo-500",
    },
  ];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="block-link-gray" className={"mt-0"}>
          <div className="flex items-center gap-2">
            <InfoIcon className="size-4" />
            {t("bookings.howBookingsWork")}
          </div>
        </Button>
      </SheetTrigger>

      <SheetContent
        hideCloseButton
        className={tw("border-l-0 bg-white p-0", className)}
      >
        <div className="flex items-center justify-between bg-blue-500 p-4 text-static-white">
          <div className="flex items-center gap-2 text-lg font-bold">
            <InfoIcon className="size-4" />
            {t("bookings.bookingProcess")}
          </div>

          <Close className="opacity-70 transition-opacity hover:opacity-100">
            <XIcon className="size-4" />
            <span className="sr-only">{t("common.close")}</span>
          </Close>
        </div>

        <div className="p-4">
          <p className="mb-8 border-b-2 border-blue-500 bg-blue-50 p-2 text-blue-500">
            {t("bookings.processIntro")}
          </p>

          <div className="mb-8 flex flex-col gap-4">
            {ITEMS.map((item, i) => (
              <div key={item.id} className="flex items-start gap-4">
                <div
                  className={tw(
                    "flex items-center justify-center rounded-full p-4",
                    item.iconClassName,
                  )}
                >
                  {}
                  <item.icon className="size-5" />
                </div>

                <div>
                  <h3 className="mb-1">
                    {i + 1}. {item.title}
                  </h3>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md bg-gray-50 p-4">
            <h3 className="mb-1">{t("bookings.importantNotes")}</h3>

            <ul className="list-inside list-disc">
              <li>{t("bookings.note1")}</li>
              <li>{t("bookings.note2")}</li>
              <li>{t("bookings.note3")}</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
