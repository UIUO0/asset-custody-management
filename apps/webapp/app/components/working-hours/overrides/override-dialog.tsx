import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { useZorm } from "react-zorm";
import FormRow from "~/components/forms/form-row";
import Input from "~/components/forms/input";
import { Switch } from "~/components/forms/switch";
import { TimeSelect } from "~/components/forms/time-select";
import { Dialog, DialogPortal } from "~/components/layout/dialog";
import { Button } from "~/components/shared/button";
import { Spinner } from "~/components/shared/spinner";
import When from "~/components/when/when";
import { useDisabled } from "~/hooks/use-disabled";
import { CreateOverrideFormSchema } from "~/modules/working-hours/zod-utils";

export function NewOverrideDialog() {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const disabled = useDisabled();

  function handleOpenDialog() {
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
  }
  const handleOverrideSuccess = () => {
    // Close dialog on successful creation
    setIsDialogOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={handleOpenDialog}
        disabled={disabled}
        icon="plus"
      >
        {t("ui.addOverride")}
      </Button>
      <DialogPortal>
        <Dialog
          open={isDialogOpen}
          onClose={handleCloseDialog}
          headerClassName="border-b"
          title={
            <div className="-mb-3 w-full pb-6">
              <h3>{t("workingHours.createNewOverride")}</h3>
              <p className="text-gray-600">
                {t("ui.createANewDateOverrideForYourWorkingHours")}
              </p>
            </div>
          }
          className="md:w-[650px] [&_.dialog-header>button]:mt-1"
        >
          <div className="px-6 pb-4">
            <WorkingHoursOverrideForm
              onSuccess={handleOverrideSuccess}
              onCancel={handleCloseDialog}
            />
          </div>
        </Dialog>
      </DialogPortal>
    </>
  );
}

interface WorkingHoursOverrideFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}
export const WorkingHoursOverrideForm = ({
  onSuccess,
  onCancel,
}: WorkingHoursOverrideFormProps) => {
  const { t } = useTranslation();
  /**
   * Typed structurally rather than off a route's `action`: this dialog used to
   * borrow the (now deleted) booking-settings route type, but it only ever
   * reads `success` and the error payload back.
   */
  const fetcher = useFetcher<{
    success?: boolean;
    error?: { message: string };
  }>({
    key: "workingHoursOverride",
  });
  const disabled = useDisabled(fetcher);
  const zo = useZorm("WorkingHoursOverrideForm", CreateOverrideFormSchema);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Get today's date as absolute date for minimum date validation
  const todayAbsolute = format(new Date(), "yyyy-MM-dd");

  const handleIsOpenChange = (checked: boolean) => {
    setIsOpen(checked);
  };

  // Handle successful submission
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "success" in fetcher.data &&
      fetcher.data.success &&
      onSuccess
    ) {
      onSuccess();
    }
  }, [fetcher.state, fetcher.data, onSuccess]);

  return (
    <div className="">
      <fetcher.Form ref={zo.ref} method="post" className="">
        <input type="hidden" name="intent" value="createOverride" />

        {/* Override Open/Closed Toggle */}
        <FormRow
          rowLabel={t("workingHours.overrideStatus")}
          subHeading={t("workingHours.chooseOpenOrClosed")}
          className="border-b pb-4"
        >
          <div className="flex items-center gap-3">
            <Switch
              name={zo.fields.isOpen()}
              id="override-is-open"
              disabled={disabled}
              defaultChecked={isOpen}
              onCheckedChange={handleIsOpenChange}
              title={t("workingHours.toggleOverrideStatus")}
            />
            <label htmlFor="override-is-open" className="text-sm font-medium">
              Open
            </label>
          </div>
          {zo.errors.isOpen()?.message && (
            <div className="mt-1 text-sm text-error-500">
              {zo.errors.isOpen()?.message}
            </div>
          )}
        </FormRow>

        {/* Date Field */}
        <FormRow
          rowLabel={t("ui.date")}
          subHeading={t("workingHours.selectOverrideDate")}
          className="border-b pb-4"
          required
        >
          <Input
            label={t("workingHours.overrideDate")}
            hideLabel
            type="date"
            name={zo.fields.date()}
            disabled={disabled}
            required
            min={todayAbsolute}
            error={zo.errors.date()?.message}
            className="w-full"
          />
        </FormRow>

        {/* Time Fields - Only show when isOpen is true */}
        {isOpen && (
          <FormRow
            rowLabel={t("workingHours.operatingHours")}
            subHeading={t("workingHours.setOpenClose")}
            className="border-b pb-4"
            required
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <TimeSelect
                  name="openTime"
                  disabled={disabled}
                  placeholder={t("workingHours.selectOpeningTime")}
                  aria-label={t("workingHours.overrideOpeningTime")}
                  required={isOpen}
                  defaultValue="09:00"
                />
                <div className="text-gray-500">-</div>
                <TimeSelect
                  name="closeTime"
                  disabled={disabled}
                  placeholder={t("workingHours.selectClosingTime")}
                  aria-label={t("workingHours.overrideClosingTime")}
                  required={isOpen}
                  defaultValue="17:00"
                />
              </div>
              {(zo.errors.openTime()?.message ||
                zo.errors.closeTime()?.message) && (
                <div className="text-sm text-error-500">
                  {zo.errors.openTime()?.message ||
                    zo.errors.closeTime()?.message}
                </div>
              )}
            </div>
          </FormRow>
        )}

        {/* Reason Field */}
        <FormRow
          rowLabel={t("assetUpdate.colReason")}
          subHeading={t("workingHours.reasonHint")}
          className="border-b pb-4"
          required
        >
          <Input
            label={t("workingHours.reasonForOverride")}
            hideLabel
            type="text"
            name={zo.fields.reason()}
            disabled={disabled}
            required
            placeholder={t("workingHours.reasonPlaceholder")}
            maxLength={500}
            error={zo.errors.reason()?.message}
            className="w-full"
          />
        </FormRow>

        {/* Form Actions */}
        <div className="mt-4 flex justify-between gap-3">
          <When truthy={!!fetcher?.data?.error}>
            <p className="text-sm text-error-500">
              {fetcher.data?.error?.message}
            </p>
          </When>
          <div className="ms-auto flex items-center gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={disabled}
              >
                {t("common.cancel")}
              </Button>
            )}
            <Button
              type="submit"
              disabled={disabled}
              className={"whitespace-nowrap"}
            >
              {disabled ? <Spinner /> : t("workingHours.createOverride")}
            </Button>
          </div>
        </div>
      </fetcher.Form>
    </div>
  );
};
