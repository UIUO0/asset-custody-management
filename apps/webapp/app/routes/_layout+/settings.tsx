import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, Outlet, useLoaderData, useMatches } from "react-router";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import HorizontalTabs from "~/components/layout/horizontal-tabs";
import When from "~/components/when/when";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import type { RouteHandleWithName } from "~/modules/types";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import { isPersonalOrg } from "~/utils/organization";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

/** Breadcrumb for settings (component so it can use the translation hook). */
function SettingsBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/settings">{t("settings.title")}</Link>;
}

export const handle = {
  breadcrumb: () => <SettingsBreadcrumb />,
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { currentOrganization } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.generalSettings,
      action: PermissionAction.read,
    });

    const title = "Settings";
    const subHeading = "Manage your preferences here.";
    const header = {
      title,
      subHeading,
    };

    return payload({
      header,
      _isPersonalOrg: isPersonalOrg(currentOrganization),
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
  return [{ title: appendToMetaTitle(resources.settings.title) }];
};

export const shouldRevalidate = () => false;

export default function SettingsPage() {
  const { t } = useTranslation();
  const { _isPersonalOrg } = useLoaderData<typeof loader>();
  let items = [
    { to: "general", content: t("settings.general") },
    ...(!_isPersonalOrg
      ? [{ to: "bookings", content: t("settings.bookings") }]
      : []),
    ...(!_isPersonalOrg
      ? [{ to: "emails", content: t("settings.emails") }]
      : []),
    { to: "custom-fields", content: t("settings.customFields") },
    { to: "asset-models", content: t("settings.assetModels") },
    { to: "team", content: t("settings.team") },
  ];

  const { isBaseOrSelfService } = useUserRoleHelper();
  /** If user is self service, remove the extra items */
  if (isBaseOrSelfService) {
    items = items.filter(
      (item) =>
        ![
          "custom-fields",
          "team",
          "general",
          "bookings",
          "emails",
          "asset-models",
        ].includes(item.to),
    );
  }

  const matches = useMatches();
  const currentRoute: RouteHandleWithName = matches[matches.length - 1];
  return (
    <>
      <Header title={t("settings.title")} hidePageDescription />
      <When
        truthy={
          !["$userId.assets", "$userId.bookings", "$userId.notes"].includes(
            currentRoute?.handle?.name,
          )
        }
      >
        <HorizontalTabs items={items} />
      </When>
      <Outlet />
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
