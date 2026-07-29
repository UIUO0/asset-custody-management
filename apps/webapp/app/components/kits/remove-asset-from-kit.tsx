import type { Asset } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { useNavigation } from "react-router";
import { isFormProcessing } from "~/utils/form";
import { Form } from "../custom-form";
import Icon from "../icons/icon";
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

export default function RemoveAssetFromKit({
  asset,
}: {
  asset: Pick<Asset, "id" | "title">;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          className="justify-start rounded-sm px-2 py-1.5 text-sm font-medium text-gray-700 outline-none hover:bg-slate-100 hover:text-gray-700"
          width="full"
          icon="trash"
        >
          {t("common.remove")}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto md:m-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
              <Icon icon="trash" />
            </span>
          </div>
          <AlertDialogTitle>Remove "{asset.title}" from kit</AlertDialogTitle>
          <AlertDialogDescription>
            {t("kits.removeAssetConfirm")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <div className="flex justify-center gap-2">
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary">
                {t("common.cancel")}
              </Button>
            </AlertDialogCancel>

            <Form method="post" action={`..`}>
              <input type="hidden" name="assetId" value={asset.id} />
              <Button
                type="submit"
                name="intent"
                value="removeAsset"
                disabled={disabled}
              >
                {t("common.remove")}
              </Button>
            </Form>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
