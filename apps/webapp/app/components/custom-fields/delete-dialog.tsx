import { useEffect, useState } from "react";
import type { CustomField } from "@prisma/client";
import { Trans, useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import Input from "~/components/forms/input";
import { TrashIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import { DropdownMenuItem } from "~/components/shared/dropdown";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/shared/modal";
import type { action as deleteAction } from "~/routes/_layout+/settings.custom-fields";
import { isFormProcessing } from "~/utils/form";

export function DeleteCustomFieldDialog({
  customField,
}: {
  customField: CustomField;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof deleteAction>();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const disabled = isFormProcessing(fetcher.state);
  const expectedName = customField.name;
  const confirmationMatches =
    confirmation.trim().toLowerCase() === expectedName.toLowerCase();

  const resetDialog = () => {
    setFormError(null);
    setConfirmation("");
  };

  useEffect(() => {
    if (!fetcher.data) return;

    if (fetcher.data.error) {
      setFormError(fetcher.data.error.message);
      return;
    }

    // Don't reset here - onOpenChange will handle it when dialog closes
    setOpen(false);
  }, [fetcher.data]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled && nextOpen) return;
        if (!nextOpen) {
          resetDialog();
        }
        setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger asChild>
        <DropdownMenuItem
          className="cursor-pointer rounded px-4 py-3 text-start text-sm hover:bg-gray-50"
          onSelect={(e) => {
            e.preventDefault();
          }}
        >
          <span className="flex items-center gap-2">
            <TrashIcon /> {t("customFields.delete")}
          </span>
        </DropdownMenuItem>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <fetcher.Form method="DELETE" action="/settings/custom-fields">
          <input type="hidden" name="id" value={customField.id} />
          <AlertDialogHeader>
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600 md:mx-0">
              <TrashIcon />
            </div>
            <AlertDialogTitle>
              {t("customFields.deleteTitle", { name: customField.name })}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <Trans
                  i18nKey="customFields.deleteWarning"
                  components={{ 1: <strong /> }}
                />
              </p>
              <p>
                <Trans
                  i18nKey="customFields.deleteNote"
                  components={{ 1: <strong /> }}
                />
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-4 space-y-2">
            <p className="text-sm text-gray-600">
              {t("customFields.confirmType")}
            </p>
            <Input
              label={t("customFields.confirmation")}
              name="confirmation"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                if (formError) setFormError(null);
              }}
              required
            />
            <p className="text-sm text-gray-500">
              {t("customFields.expectedInput", { name: expectedName })}
            </p>
            {formError ? (
              <p className="text-sm text-error-500">{formError}</p>
            ) : null}
          </div>

          <AlertDialogFooter className="mt-6 flex ">
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary" disabled={disabled}>
                {t("common.cancel")}
              </Button>
            </AlertDialogCancel>
            <Button
              className="border-error-600 bg-error-600 hover:border-error-800 hover:bg-error-800"
              type="submit"
              disabled={disabled || !confirmationMatches}
              name="intent"
              value="delete"
            >
              {disabled ? t("customFields.deleting") : t("customFields.delete")}
            </Button>
          </AlertDialogFooter>
        </fetcher.Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
