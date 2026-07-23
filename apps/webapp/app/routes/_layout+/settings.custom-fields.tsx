import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Link, Outlet } from "react-router";
import { z } from "zod";
import { ErrorContent } from "~/components/errors";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import {
  softDeleteCustomField,
  getCustomField,
} from "~/modules/custom-field/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { ShelfError, makeShelfError } from "~/utils/error";
import { payload, error, parseData } from "~/utils/http.server";

import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta = ({
  matches,
}: {
  matches: Array<{ id: string; data?: unknown }>;
}) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [
    {
      title: appendToMetaTitle(resources.settings.customFieldsSettingsTitle),
    },
  ];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.customField,
      action: PermissionAction.read,
    });

    return payload(null);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.customField,
      action: PermissionAction.delete,
    });

    const { id, confirmation } = parseData(
      await request.formData(),
      z.object({
        id: z.string(),
        confirmation: z
          .string()
          .min(1, "Confirmation is required")
          .transform((value) => value.trim()),
      }),
      { additionalData: { userId } },
    );

    const customField = await getCustomField({ id, organizationId });

    // Case-insensitive comparison
    if (customField.name.toLowerCase() !== confirmation.toLowerCase()) {
      throw new ShelfError({
        cause: null,
        message:
          "Confirmation text does not match the custom field name (case-insensitive).",
        additionalData: {
          userId,
          customFieldId: id,
          confirmation,
          expected: customField.name,
        },
        label: "Custom fields",
        status: 400,
        shouldBeCaptured: false,
      });
    }

    await softDeleteCustomField({ id, organizationId });

    sendNotification({
      title: "Custom field deleted",
      message: `The custom field "${customField.name}" has been deleted. You can now create a new field with the same name if needed.`,
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

/** Breadcrumb for custom fields (component so it can use the hook). */
function CustomFieldsBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/settings/custom-fields">{t("settings.customFields")}</Link>;
}

export const handle = {
  breadcrumb: () => <CustomFieldsBreadcrumb />,
};

// export const shouldRevalidate = () => false;

export default function CustomFieldsPage() {
  return <Outlet />;
}

export const ErrorBoundary = () => <ErrorContent />;
