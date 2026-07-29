import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigation, useLocation, useActionData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
import { Separator } from "~/components/shared/separator";
import { useSearchParams } from "~/hooks/search-params";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { dateForDateTimeInputValue } from "~/utils/date-fns";
import { isFormProcessing } from "~/utils/form";
import { getValidationErrors } from "~/utils/http";
import type { DataOrErrorResponse } from "~/utils/http.server";
import TeamMembersSelector from "./team-members-selector";
import { Dialog, DialogPortal } from "../layout/dialog";

export const setReminderSchema = z.object({
  name: z.string().min(1, "Please enter name."),
  message: z.string().min(1, "Please enter message."),
  alertDateTime: z.coerce
    .date()
    .min(new Date(), "Please select a date in the future"),
  teamMembers: z
    .array(z.string())
    .min(1, "Please select at least one team member"),
  redirectTo: z.string().optional(),
});

type SetOrEditReminderDialogProps = {
  open: boolean;
  onClose: () => void;
  reminder?: z.infer<typeof setReminderSchema> & { id: string };
  action?: string;
};

export default function SetOrEditReminderDialog({
  open,
  onClose,
  reminder,
  action,
}: SetOrEditReminderDialogProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);

  const pathname = useLocation().pathname;
  const [searchParams, setSearchParams] = useSearchParams();

  const redirectTo = `${pathname}${
    searchParams.size > 0
      ? `?${searchParams.toString()}&success=true`
      : "?success=true"
  }`;

  const zo = useZorm("SetOrEditReminder", setReminderSchema);

  const actionData = useActionData<DataOrErrorResponse>();
  /** This handles server side errors in case client side validation fails */
  const validationErrors = getValidationErrors<typeof setReminderSchema>(
    actionData?.error,
  );

  const isEdit = !!reminder;

  /** Ref for the first field so we can focus it on open without autoFocus. */
  const nameInputRef = useAutoFocus<HTMLInputElement>({ when: open });

  useEffect(
    function handleOnSuccess() {
      if (searchParams.get("success") === "true") {
        onClose && onClose();

        setSearchParams((prev) => {
          prev.delete("success");
          return prev;
        });
      }
    },
    [onClose, searchParams, setSearchParams],
  );

  return (
    <DialogPortal>
      <Dialog
        open={open}
        onClose={onClose}
        className="md:w-[800px]"
        headerClassName="border-b"
        title={
          <div className="-mb-3 w-full pb-6">
            <h3>{t("reminders.setReminder")}</h3>
            <p className="text-gray-600">{t("reminders.notifyHint")}</p>
          </div>
        }
      >
        <Form
          ref={zo.ref}
          method="POST"
          encType="multipart/form-data"
          className="grid grid-cols-1 divide-x md:grid-cols-2"
          action={action}
        >
          <div className="px-6 py-4">
            <input
              type="hidden"
              name="intent"
              value={isEdit ? "edit-reminder" : "set-reminder"}
            />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            {isEdit ? (
              <input type="hidden" name="id" value={reminder.id} />
            ) : (
              false
            )}

            <Input
              ref={nameInputRef}
              defaultValue={reminder?.name ?? ""}
              name={zo.fields.name()}
              error={
                validationErrors?.name?.message || zo.errors.name()?.message
              }
              label={t("assets.name")}
              disabled={disabled}
              required
              placeholder={t("reminders.namePlaceholder")}
              className="mb-4"
            />

            <div className="mb-4">
              <Input
                defaultValue={reminder?.message ?? ""}
                name={zo.fields.message()}
                error={
                  validationErrors?.message?.message ||
                  zo.errors.message()?.message
                }
                label={t("reminders.message")}
                disabled={disabled}
                required
                placeholder={t("reminders.descriptionPlaceholder")}
                inputType="textarea"
                className="mb-2"
              />
              <p className="text-gray-500">{t("reminders.messageHint")}</p>
            </div>

            <div>
              <Input
                defaultValue={
                  reminder?.alertDateTime
                    ? dateForDateTimeInputValue(
                        new Date(reminder.alertDateTime),
                      )
                    : undefined
                }
                type="datetime-local"
                name={zo.fields.alertDateTime()}
                error={
                  validationErrors?.alertDateTime?.message ||
                  zo.errors.alertDateTime()?.message
                }
                label={t("reminders.reminderDate")}
                disabled={disabled}
                required
                placeholder={t("reminders.descriptionPlaceholder")}
                className="mb-2"
              />
              <p className="text-gray-500">{t("reminders.dateHint")}</p>
            </div>
          </div>
          <div>
            <Separator className="md:hidden" />
            <p className="border-b p-3 font-medium">
              {t("reminders.selectTeamMembers")}
            </p>
            <TeamMembersSelector
              defaultValues={reminder?.teamMembers}
              error={
                validationErrors?.teamMembers?.message ||
                zo.errors.teamMembers()?.message
              }
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t p-4 md:col-span-2">
            <Button
              type="button"
              role="button"
              variant="secondary"
              disabled={disabled}
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
            <Button role="button" type="submit" disabled={disabled}>
              {t("common.confirm")}
            </Button>
          </div>
        </Form>
      </Dialog>
    </DialogPortal>
  );
}
