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
import { createTag } from "~/modules/tag/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { getRandomColor } from "~/utils/get-random-color";
import { assertIsPost, payload, error, parseData } from "~/utils/http.server";
import { formatEnum } from "~/utils/misc";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { zodFieldIsRequired } from "~/utils/zod";

export const NewTagFormSchema = z.object({
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

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.tag,
      action: PermissionAction.create,
    });

    // Header copy is rendered server-side, so we resolve it with the request's
    // locale instead of the React hook.
    const t = await getFixedT(getLocale(request));
    const header = {
      title: t("tags.newTag"),
    };

    return payload({
      header,
      colorFromServer: getRandomColor(),
      tagUseFor: Object.values(TagUseFor).map((useFor) => ({
        label: formatEnum(useFor),
        value: useFor,
      })),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [{ title: appendToMetaTitle(resources.tags.newTag) }];
};

export async function action({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    assertIsPost(request);

    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.tag,
      action: PermissionAction.create,
    });

    const payload = parseData(await request.formData(), NewTagFormSchema, {
      additionalData: { userId, organizationId },
    });

    await createTag({
      ...payload,
      userId: authSession.userId,
      organizationId,
    });

    sendNotification({
      title: "Tag created",
      message: "Your tag has been created successfully",
      icon: { name: "success", variant: "success" },
      senderId: authSession.userId,
    });

    return redirect(`/tags`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function NewTag() {
  const { t } = useTranslation();
  // Focus the Name input on mount of the new-tag page.
  const nameInputRef = useAutoFocus<HTMLInputElement>();
  const zo = useZorm("NewQuestionWizardScreen", NewTagFormSchema);
  const { tagUseFor, colorFromServer } = useLoaderData<typeof loader>();

  const disabled = useDisabled();
  const actionData = useActionData<typeof action>();

  return (
    <>
      <Form
        method="post"
        className="block rounded border border-gray-200 bg-white px-6 py-5 "
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
              required={zodFieldIsRequired(NewTagFormSchema.shape.name)}
            />
            <Input
              label={t("tags.description")}
              placeholder={t("tags.descriptionPlaceholder")}
              name={zo.fields.description()}
              disabled={disabled}
              data-test-id="tagDescription"
              className="mb-4 lg:mb-0"
              required={zodFieldIsRequired(NewTagFormSchema.shape.description)}
            />
            <div className="mb-6 lg:mb-0">
              <ColorInput
                name={zo.fields.color()}
                disabled={disabled}
                error={zo.errors.color()?.message}
                hideErrorText
                colorFromServer={colorFromServer}
                required={zodFieldIsRequired(NewTagFormSchema.shape.color)}
              />
            </div>
            <MultiSelect
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
              {t("common.create")}
            </Button>
          </div>
        </div>

        {actionData?.error ? (
          <div className="mt-3 text-sm text-error-500">
            {actionData?.error.message}
          </div>
        ) : null}
      </Form>
    </>
  );
}
