import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { Organization, Currency } from "@prisma/client";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { useActionData, useNavigation } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { updateDynamicTitleAtom } from "~/atoms/dynamic-title-atom";
import { defaultValidateFileAtom, fileErrorAtom } from "~/atoms/file";
import { useSearchParams } from "~/hooks/search-params";
import { ACCEPT_SUPPORTED_IMAGES } from "~/utils/constants";
import { ISO_4217_CURRENCIES } from "~/utils/currency";
import { isFormProcessing } from "~/utils/form";
import { zodFieldIsRequired } from "~/utils/zod";
import { Form } from "../custom-form";
import FormRow from "../forms/form-row";
import { InnerLabel } from "../forms/inner-label";
import Input from "../forms/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../forms/select";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import { Spinner } from "../shared/spinner";

export const NewWorkspaceFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  currency: z.custom<Currency>(),
});

/** Pass props of the values to be used as default for the form fields */
interface Props {
  name?: Organization["name"];
  currency?: Organization["currency"];
  children?: string | ReactNode;
}

export const WorkspaceForm = ({ name, currency, children }: Props) => {
  const { t } = useTranslation();
  const actionData = useActionData<{ error?: any }>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const zo = useZorm("NewQuestionWizardScreen", NewWorkspaceFormSchema);
  const disabled = isFormProcessing(navigation.state);
  const fileError = useAtomValue(fileErrorAtom);
  const [, validateFile] = useAtom(defaultValidateFileAtom);
  const [, updateTitle] = useAtom(updateDynamicTitleAtom);
  const nameFieldRef = useRef<HTMLInputElement>(null);

  const imageError =
    (actionData?.error?.additionalData?.field === "image"
      ? actionData?.error?.message
      : undefined) ?? fileError;

  useEffect(() => {
    const team = searchParams.get("team");
    if (!team && nameFieldRef.current) {
      nameFieldRef.current.focus();
    }
  }, [searchParams]);

  return (
    <Card className="w-full md:w-min">
      <Form
        ref={zo.ref}
        method="post"
        className="flex w-full flex-col gap-2"
        encType="multipart/form-data"
      >
        <FormRow
          rowLabel={"Name"}
          subHeading={t("workspaceForm2.nameHint")}
          className="border-b-0 pb-[10px] pt-0"
          required={zodFieldIsRequired(NewWorkspaceFormSchema.shape.name)}
        >
          <Input
            label="Name"
            hideLabel
            name={zo.fields.name()}
            disabled={disabled}
            error={zo.errors.name()?.message}
            onChange={updateTitle}
            className="w-full"
            defaultValue={name || undefined}
            placeholder=""
            required={zodFieldIsRequired(NewWorkspaceFormSchema.shape.name)}
            ref={nameFieldRef}
          />
        </FormRow>

        <FormRow
          rowLabel={t("workspaceForm2.mainImage")}
          className="border-b-0"
          subHeading={t("workspaceForm2.imageHint")}
        >
          <div>
            <p className="hidden lg:block">
              Accepts PNG, JPG, JPEG, or WebP (max.4 MB)
            </p>
            <Input
              // disabled={disabled}
              accept={ACCEPT_SUPPORTED_IMAGES}
              name="image"
              type="file"
              onChange={validateFile}
              label={t("workspaceForm2.mainImage")}
              hideLabel
              error={imageError}
              className="mt-2"
              inputClassName="border-0 shadow-none p-0 rounded-none"
            />
            <p className="mt-2 lg:hidden">
              Accepts PNG, JPG, JPEG, or WebP (max.4 MB)
            </p>
          </div>
        </FormRow>

        <div>
          <FormRow
            rowLabel={"Currency"}
            className={children ? "border-b-0" : ""}
            subHeading={t("workspaceForm2.currencyHint")}
          >
            <InnerLabel hideLg>Currency</InnerLabel>

            <Select
              defaultValue={currency || "USD"}
              disabled={disabled}
              name={zo.fields.currency()}
            >
              <SelectTrigger className="px-3.5 py-3">
                <SelectValue placeholder={t("workspaceForm2.chooseCurrency")} />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="w-full min-w-[300px]"
                align="start"
              >
                <div className=" max-h-[320px] overflow-auto">
                  {ISO_4217_CURRENCIES.map((c) => (
                    <SelectItem value={c.code} key={c.code}>
                      <span className="me-4 text-[14px] text-gray-700">
                        <span className="font-medium">{c.code}</span>
                        <span className="ms-2 text-gray-500">{c.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </div>
              </SelectContent>
            </Select>
          </FormRow>
        </div>
        <div className="text-end">
          <Button type="submit" disabled={disabled}>
            {disabled ? <Spinner /> : "Save"}
          </Button>
        </div>
      </Form>
    </Card>
  );
};
