import type { ReactElement } from "react";
import { cloneElement } from "react";
import type { Kit } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { useNavigation } from "react-router";
import { isFormProcessing } from "~/utils/form";
import { Form } from "../custom-form";
import { TrashIcon } from "../icons/library";
import { Button } from "../shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../shared/modal";

type DeleteKitProps = {
  kit: Pick<Kit, "id" | "name" | "image">;
  trigger?: ReactElement;
};

export default function DeleteKit({ kit, trigger }: DeleteKitProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ? (
          cloneElement(trigger)
        ) : (
          <Button
            type="button"
            variant="link"
            icon="trash"
            className="justify-start rounded-sm px-4 py-3 text-sm font-semibold text-gray-700 outline-none  hover:bg-slate-100 hover:text-gray-700"
            width="full"
          >
            {t("common.delete")}
          </Button>
        )}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto md:m-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
              <TrashIcon />
            </span>
          </div>
          <AlertDialogTitle>Delete {kit.name}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("kits.deleteConfirm")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex justify-center gap-2">
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary" disabled={disabled}>
                {t("common.cancel")}
              </Button>
            </AlertDialogCancel>

            <Form method="delete" action={`/kits/${kit.id}`}>
              {kit.image && (
                <input type="hidden" value={kit.image} name="image" />
              )}
              <input type="hidden" value="delete" name="intent" />
              <Button
                type="submit"
                className="border-error-600 bg-error-600 hover:border-error-800 hover:bg-error-800"
                disabled={disabled}
              >
                {t("common.delete")}
              </Button>
            </Form>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
