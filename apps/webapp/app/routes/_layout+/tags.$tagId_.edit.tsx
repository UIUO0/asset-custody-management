import { TagUseFor } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { Form } from "~/components/custom-form";
import { ColorInput } from "~/components/forms/color-input";
import Input from "~/components/forms/input";
import MultiSelect from "~/components/multi-select/multi-select";
import { Button } from "~/components/shared/button";
import { useAutoFocus } from "~/hooks/use-auto-focus";

import { useDisabled } from "~/hooks/use-disabled";

import { getFixedT, getLocale } from "~/i18n/i18n.server";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getTag, updateTag } from "~/modules/tag/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { payload, error, getParams, parseData } from "~/utils/http.server";
import { formatEnum } from "~/utils/misc";

import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { zodFieldIsRequired } from "~/utils/zod";

export const UpdateTagFormSchema = z.object({
  name: z.string().min(3, "Name is required"),
  description: z.string(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal(""))
    .transform((val) => (val === "" || !val ? null : val)),
  useFor: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value.split(",") : []))
    .pipe(z.array(z.nativeEnum(TagUseFor)).optional().default([])),
});

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { tagId: id } = getParams(params, z.object({ tagId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.tag,
      action: PermissionAction.update,
    });

    const tag = await getTag({ id, organizationId });

    // Header copy is rendered server-side, so we resolve it with the request's
    // locale instead of the React hook.
    const t = await getFixedT(getLocale(request));
    const header = {
      title: t("tags.editTitle"),
    };

    return payload({
      header,
      tag,
      colorFromServer: tag.color ?? undefined,
      tagUseFor: Object.values(TagUseFor).map((useFor) => ({
        label: formatEnum(useFor),
        value: useFor,
      })),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, id });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [{ title: appendToMetaTitle(resources.tags.editTitle) }];
};

export async function action({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { tagId: id } = getParams(params, z.object({ tagId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.tag,
      action: PermissionAction.update,
    });

    const payload = parseData(await request.formData(), UpdateTagFormSchema, {
      additionalData: { userId, id, organizationId },
    });

    await updateTag({
      ...payload,
      id,
      organizationId,
    });

    sendNotification({
      title: "Tag Updated",
      message: "Your tag has been updated successfully",
      icon: { name: "success", variant: "success" },
      senderId: authSession.userId,
    });

    return redirect(`/tags`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function EditTag() {
  const { t } = useTranslation();
  // Focus the Name input on mount of the edit page.
  const nameInputRef = useAutoFocus<HTMLInputElement>();
  const zo = useZorm("NewQuestionWizardScreen", UpdateTagFormSchema);
  const { tag, tagUseFor, colorFromServer } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const disabled = useDisabled();

  return tag ? (
    <>
      <Form
        method="post"
        className="block rounded-[12px] border border-gray-200 bg-white px-6 py-5 "
        ref={zo.ref}
      >
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-3">
          <div className="gap-3 lg:flex lg:items-end">
            <Input
              ref={nameInputRef}
              label={t("tags.name")}
              placeholder={t("tags.namePlaceholder")}
              className="mb-4 lg:mb-0 lg:max-w-[180px]"
              name={zo.fields.name()}
              disabled={disabled}
              error={zo.errors.name()?.message}
              hideErrorText
              required={zodFieldIsRequired(UpdateTagFormSchema.shape.name)}
              defaultValue={tag.name}
            />
            <Input
              label={t("tags.description")}
              placeholder={t("tags.descriptionPlaceholder")}
              name={zo.fields.description()}
              disabled={disabled}
              data-test-id="tagDescription"
              className="mb-4 lg:mb-0"
              required={zodFieldIsRequired(
                UpdateTagFormSchema.shape.description,
              )}
              defaultValue={tag.description || undefined}
            />
            <div className="mb-6 lg:mb-0">
              <ColorInput
                name={zo.fields.color()}
                disabled={disabled}
                error={zo.errors.color()?.message}
                hideErrorText
                colorFromServer={colorFromServer}
                required={zodFieldIsRequired(UpdateTagFormSchema.shape.color)}
              />
            </div>

            <MultiSelect
              defaultSelected={tag.useFor.map((useFor) => ({
                label: useFor,
                value: useFor,
              }))}
              name="useFor"
              items={tagUseFor}
              labelKey="label"
              valueKey="value"
              label={t("tags.useFor")}
              placeholder={t("tags.useForPlaceholder")}
              tooltip={{
                title: t("tags.useFor"),
                content: t("tags.useForTooltip"),
              }}
            />
          </div>

          <div className="flex gap-1">
            <Button
              variant="secondary"
              to="/tags"
              size="sm"
              disabled={disabled}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={disabled}>
              {t("common.update")}
            </Button>
          </div>
        </div>

        {actionData?.error ? (
          <div className="mt-3 text-sm text-error-500">
            {actionData?.error?.message}
          </div>
        ) : null}
      </Form>
    </>
  ) : null;
}
