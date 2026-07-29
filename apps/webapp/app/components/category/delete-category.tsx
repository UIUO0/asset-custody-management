import type { ReactNode } from "react";
import type { Category } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "~/components/shared/button";

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
import { isFormProcessing } from "~/utils/form";
import { Form } from "../custom-form";
import { TrashIcon } from "../icons/library";

export const DeleteCategory = ({
  category,
  trigger,
}: {
  category: Pick<Category, "name" | "id">;
  trigger?: ReactNode;
}) => {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const disabled = isFormProcessing(fetcher.state);

  const defaultTrigger = (
    <Button
      disabled={disabled}
      variant="secondary"
      size="sm"
      type="button"
      className="text-[12px]"
      icon={"trash"}
      title={t("common.delete")}
      data-test-id="deleteCategoryButton"
    />
  );

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ? trigger : defaultTrigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
            <TrashIcon />
          </span>
          <AlertDialogTitle>Delete {category.name}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("categories.deleteConfirm")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="secondary">
              {t("common.cancel")}
            </Button>
          </AlertDialogCancel>
          <Form method="delete" action="/categories">
            <input type="hidden" name="id" value={category.id} />
            <Button
              className="border-error-600 bg-error-600 hover:border-error-800 hover:bg-error-800"
              type="submit"
              data-test-id="confirmDeleteCategoryButton"
            >
              {t("common.delete")}
            </Button>
          </Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
