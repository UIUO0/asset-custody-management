import { useRef } from "react";
import type { Barcode, Kit } from "@prisma/client";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useActionData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { updateDynamicTitleAtom } from "~/atoms/dynamic-title-atom";
import { fileErrorAtom, assetImageValidateFileAtom } from "~/atoms/file";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { useDisabled } from "~/hooks/use-disabled";
import type { action as editKitAction } from "~/routes/_layout+/kits.$kitId_.edit";
import type { action as createKitAction } from "~/routes/_layout+/kits.new";
import { ACCEPT_SUPPORTED_IMAGES } from "~/utils/constants";
import { getValidationErrors } from "~/utils/http";
import { useBarcodePermissions } from "~/utils/permissions/use-barcode-permissions";
import { tw } from "~/utils/tw";
import { zodFieldIsRequired } from "~/utils/zod";
import { Form } from "../custom-form";
import DynamicSelect from "../dynamic-select/dynamic-select";
import BarcodesInput, { type BarcodesInputRef } from "../forms/barcodes-input";
import FormRow from "../forms/form-row";
import Input from "../forms/input";
import { RefererRedirectInput } from "../forms/referer-redirect-input";
import ImageWithPreview from "../image-with-preview/image-with-preview";
import InlineEntityCreationDialog from "../inline-entity-creation-dialog/inline-entity-creation-dialog";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import When from "../when/when";

export const NewKitFormSchema = z.object({
  name: z
    .string()
    .min(2, "Name is required")
    .transform((value) => value.trim()),
  description: z
    .string()
    .optional()
    .transform((value) => value?.trim()),
  category: z.string().optional(),
  qrId: z.string().optional(),
  locationId: z.string().optional(),
  redirectTo: z.string().optional(),
});

type KitFormProps = Partial<
  Pick<Kit, "name" | "description" | "categoryId" | "locationId">
> & {
  className?: string;
  qrId?: string | null;
  barcodes?: Pick<Barcode, "id" | "value" | "type">[];
  referer?: string | null;
};

export default function KitsForm({
  className,
  name,
  description,
  qrId,
  categoryId,
  barcodes,
  locationId,
  referer,
}: KitFormProps) {
  const { t } = useTranslation();
  const disabled = useDisabled();
  const { canUseBarcodes } = useBarcodePermissions();
  const barcodesInputRef = useRef<BarcodesInputRef>(null);

  // Focus the Name field on mount so create/edit pages start the user
  // typing immediately instead of relying on a removed autoFocus prop.
  const nameInputRef = useAutoFocus<HTMLInputElement>();

  const actionData = useActionData<
    typeof createKitAction | typeof editKitAction
  >();

  const fileError = useAtomValue(fileErrorAtom);
  const [, updateDynamicTitle] = useAtom(updateDynamicTitleAtom);
  const [, validateFile] = useAtom(assetImageValidateFileAtom);

  const zo = useZorm("NewKitForm", NewKitFormSchema);

  const serverValidationErrors = getValidationErrors(actionData?.error);
  const nameErrorMessage =
    serverValidationErrors?.name?.message ?? zo.errors.name()?.message;

  const imageError =
    serverValidationErrors?.image?.message ??
    (actionData?.error?.additionalData?.field === "image"
      ? actionData?.error?.message
      : undefined) ??
    fileError;

  return (
    <Card className={tw("w-full md:w-min", className)}>
      <Form
        ref={zo.ref}
        method="post"
        className="flex w-full flex-col gap-2"
        encType="multipart/form-data"
        onSubmit={(e) => {
          // Force validation of all barcode fields to show errors
          barcodesInputRef.current?.validateAll();

          // Check for barcode validation errors
          const hasBarcodeErrors = barcodesInputRef.current?.hasErrors();

          // If there are barcode errors, prevent submission
          // Zorm will handle its own validation and prevent submission if needed
          if (hasBarcodeErrors) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }}
      >
        {qrId ? (
          <input type="hidden" name={zo.fields.qrId()} value={qrId} />
        ) : null}
        <RefererRedirectInput
          fieldName={zo.fields.redirectTo()}
          referer={referer}
        />

        <FormRow
          rowLabel={t("kitForm.name")}
          className="border-b-0 pb-[10px]"
          required
        >
          <Input
            ref={nameInputRef}
            label={t("kitForm.name")}
            hideLabel
            name={zo.fields.name()}
            disabled={disabled}
            error={nameErrorMessage}
            onChange={updateDynamicTitle}
            className="w-full"
            defaultValue={name || ""}
            required
          />
        </FormRow>

        <FormRow
          rowLabel={t("kitForm.description")}
          subHeading={<p>{t("kitForm.descriptionSubheading")}</p>}
          className="border-b-0"
          required={zodFieldIsRequired(NewKitFormSchema.shape.description)}
        >
          <Input
            inputType="textarea"
            maxLength={1000}
            label={t("kitForm.description")}
            name={zo.fields.description()}
            defaultValue={description || ""}
            hideLabel
            placeholder={t("kitForm.descriptionPlaceholder")}
            disabled={disabled}
            className="w-full"
            required={zodFieldIsRequired(NewKitFormSchema.shape.description)}
          />
        </FormRow>

        <FormRow
          rowLabel={t("kitForm.category")}
          subHeading={
            <p>
              {t("kitForm.categorySubheadingText")}{" "}
              <Button
                to="/categories/new"
                variant="link-gray"
                className="text-gray-600 underline"
                target="_blank"
              >
                {t("kitForm.createCategories")}
              </Button>
            </p>
          }
          className="border-b-0 pb-[10px]"
          required={zodFieldIsRequired(NewKitFormSchema.shape.category)}
        >
          <DynamicSelect
            disabled={disabled}
            defaultValue={categoryId ?? undefined}
            model={{ name: "category", queryKey: "name" }}
            triggerWrapperClassName="flex flex-col !gap-0 justify-start items-start [&_.inner-label]:w-full [&_.inner-label]:text-start "
            contentLabel={t("nav.categories")}
            label={t("kitForm.category")}
            hideLabel
            initialDataKey="categories"
            countKey="totalCategories"
            closeOnSelect
            selectionMode="none"
            allowClear={true}
            extraContent={({ onItemCreated, closePopover }) => (
              <InlineEntityCreationDialog
                type="category"
                title={t("kitForm.createNewCategory")}
                buttonLabel={t("kitForm.createNewCategory")}
                onCreated={(created) => {
                  if (created?.type !== "category") return;
                  const category = created.entity;
                  onItemCreated({
                    id: category.id,
                    name: category.name,
                    color: category.color,
                    metadata: { ...category },
                  });
                  closePopover();
                }}
              />
            )}
          />
        </FormRow>

        <FormRow
          rowLabel={t("kitForm.location")}
          subHeading={
            <p>
              {t("kitForm.locationSubheadingText")}{" "}
              <Button
                to="/locations/new"
                className="text-gray-600 underline"
                target="_blank"
                variant="link-gray"
              >
                {t("kitForm.createLocations")}
              </Button>
            </p>
          }
          className="border-b-0 py-[10px]"
          required={zodFieldIsRequired(NewKitFormSchema.shape.locationId)}
        >
          <DynamicSelect
            disabled={disabled}
            fieldName="locationId"
            triggerWrapperClassName="flex flex-col !gap-0 justify-start items-start [&_.inner-label]:w-full [&_.inner-label]:text-start "
            defaultValue={locationId ?? undefined}
            model={{ name: "location", queryKey: "name" }}
            contentLabel={t("nav.locations")}
            label={t("kitForm.location")}
            hideLabel
            initialDataKey="locations"
            countKey="totalLocations"
            closeOnSelect
            allowClear
            extraContent={({ onItemCreated, closePopover }) => (
              <InlineEntityCreationDialog
                type="location"
                title={t("kitForm.createNewLocation")}
                buttonLabel={t("kitForm.createNewLocation")}
                onCreated={(created) => {
                  if (created?.type !== "location") return;
                  const location = created.entity;
                  onItemCreated({
                    id: location.id,
                    name: location.name,
                    metadata: { ...location },
                  });
                  closePopover();
                }}
              />
            )}
            renderItem={({ name, metadata }) => (
              <div className="flex items-center gap-2">
                {metadata?.thumbnailUrl ? (
                  <ImageWithPreview
                    thumbnailUrl={metadata.thumbnailUrl}
                    alt={metadata.name}
                    className="size-6 rounded-[2px]"
                  />
                ) : null}
                <div>{name}</div>
              </div>
            )}
          />
        </FormRow>

        <FormRow rowLabel={t("kitForm.image")} className="border-b-0 pt-[10px]">
          <div>
            <p className="hidden lg:block">{t("kitForm.imageHint")}</p>
            <Input
              disabled={disabled}
              accept={ACCEPT_SUPPORTED_IMAGES}
              name="image"
              type="file"
              onChange={validateFile}
              label={t("kitForm.image")}
              hideLabel
              error={imageError}
              className="mt-2"
              inputClassName="border-0 shadow-none p-0 rounded-none"
            />
            <p className="mt-2 lg:hidden">{t("kitForm.imageHint")}</p>
          </div>
        </FormRow>

        <When truthy={canUseBarcodes}>
          <FormRow
            rowLabel={t("kitForm.barcodes")}
            className="border-b-0"
            subHeading={t("kitForm.barcodesSubheading")}
          >
            <BarcodesInput
              ref={barcodesInputRef}
              barcodes={barcodes || []}
              typeName={(i) => `barcodes[${i}].type`}
              valueName={(i) => `barcodes[${i}].value`}
              idName={(i) => `barcodes[${i}].id`}
              disabled={disabled}
            />
          </FormRow>
        </When>

        <FormRow className="border-y-0 pb-0 pt-5" rowLabel="">
          <div className="ms-auto flex gap-2">
            <Button to={referer} variant="secondary" disabled={disabled}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={disabled}>
              {disabled ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </FormRow>
      </Form>
    </Card>
  );
}
