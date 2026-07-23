import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect } from "react-router";

import { dynamicTitleAtom } from "~/atoms/dynamic-title-atom";
import {
  CustomFieldForm,
  NewCustomFieldFormSchema,
} from "~/components/custom-fields/form";
import Header from "~/components/layout/header";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getCategoriesForCreateAndEdit } from "~/modules/asset/service.server";

import { createCustomField } from "~/modules/custom-field/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { payload, error, parseData } from "~/utils/http.server";

import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { assertUserCanCreateMoreCustomFields } from "~/utils/subscription.server";

const title = "New Custom Field";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, organizations } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.customField,
      action: PermissionAction.create,
    });

    // Subscription assertion and categories lookup are independent — run in parallel
    const [, categoriesResult] = await Promise.all([
      assertUserCanCreateMoreCustomFields({
        organizations,
        organizationId,
      }),
      getCategoriesForCreateAndEdit({
        organizationId,
        request,
      }),
    ]);
    const { categories, totalCategories } = categoriesResult;

    const header = {
      title,
    };

    return payload({
      header,
      categories,
      totalCategories,
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
  return [{ title: appendToMetaTitle(resources.settings.newCustomFieldTitle) }];
};

/** Breadcrumb for the new custom field page (component so it can use the hook). */
function NewCustomFieldBreadcrumb() {
  const { t } = useTranslation();
  return <span>{t("settings.newCustomFieldTitle")}</span>;
}

export const handle = {
  breadcrumb: () => <NewCustomFieldBreadcrumb />,
};

export async function action({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, organizations } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.customField,
      action: PermissionAction.create,
    });

    await assertUserCanCreateMoreCustomFields({
      organizations,
      organizationId,
    });

    const payload = parseData(
      await request.formData(),
      NewCustomFieldFormSchema,
    );

    const { name, helpText, required, type, active, options, categories } =
      payload;

    await createCustomField({
      name,
      helpText,
      required,
      type,
      active,
      organizationId,
      userId: authSession.userId,
      options,
      categories,
    });

    sendNotification({
      title: "Custom Field created",
      message: "Your Custom Field has been created successfully",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return redirect(`/settings/custom-fields`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function NewCustomFieldPage() {
  const { t } = useTranslation();
  const title = useAtomValue(dynamicTitleAtom);

  return (
    <>
      <Header
        hideBreadcrumbs
        title={title ? title : t("settings.untitledCustomField")}
        classNames="-mt-5"
      />
      <div>
        <CustomFieldForm />
      </div>
    </>
  );
}
