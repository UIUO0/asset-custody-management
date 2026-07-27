import { CalendarIcon } from "@radix-ui/react-icons";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/shared/button";
import { ButtonGroup } from "~/components/shared/button-group";
import { useSearchParams } from "~/hooks/search-params";
import { useIsAvailabilityView } from "~/hooks/use-is-availability-view";
import { tw } from "~/utils/tw";

export function AvailabilityViewToggle({
  modeIsSimple = true,
}: {
  modeIsSimple?: boolean;
}) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const disabledButtonStyles =
    "cursor-not-allowed pointer-events-none bg-gray-50 text-gray-800";
  const { isAvailabilityView, shouldShowAvailabilityView } =
    useIsAvailabilityView();

  return shouldShowAvailabilityView ? (
    <div className="flex items-start gap-2">
      <ButtonGroup>
        <Button
          variant="secondary"
          className={tw(
            "px-[14px]  hover:cursor-pointer",
            "font-normal text-gray-600",
            !isAvailabilityView ? disabledButtonStyles : "",
            modeIsSimple ? "py-[10px]" : "",
          )}
          disabled={!isAvailabilityView}
          type="button"
          onClick={() => {
            setSearchParams((prev) => {
              const newParams = new URLSearchParams(prev);
              newParams.delete("view");
              return newParams;
            });
          }}
          title={t("assetsIndex.switchToListView")}
          tooltip={t("assetsIndex.listView")}
          aria-label={t("assetsIndex.switchToListView")}
          icon="sort"
        />
        <Button
          variant="secondary"
          className={tw(
            "px-[14px] hover:cursor-pointer",
            "font-normal text-gray-600",
            isAvailabilityView ? disabledButtonStyles : "",
            modeIsSimple ? "py-[10px]" : "",
          )}
          disabled={isAvailabilityView}
          type={"button"}
          onClick={() => {
            setSearchParams((prev) => {
              const newParams = new URLSearchParams(prev);
              newParams.set("view", "availability");
              return newParams;
            });
          }}
          title={t("assetsIndex.switchToAvailabilityView")}
          tooltip={t("assetsIndex.availabilityView")}
          aria-label={t("assetsIndex.switchToAvailabilityView")}
        >
          <CalendarIcon className="size-5" />
        </Button>
      </ButtonGroup>
    </div>
  ) : null;
}
