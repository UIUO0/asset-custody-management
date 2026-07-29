import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, Outlet, useRouteLoaderData } from "react-router";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import HorizontalTabs from "~/components/layout/horizontal-tabs";
import { getFixedT, getLocale } from "~/i18n/i18n.server";
import type { loader as layoutLoader } from "~/routes/_layout+/_layout";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

/** Breadcrumb for account details (component so it can use the translation hook). */
function AccountDetailsBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/account-details">{t("accountDetails.title")}</Link>;
}

export const handle = {
  breadcrumb: () => <AccountDetailsBreadcrumb />,
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    await requirePermission({
      userId,
      request,
      entity: PermissionEntity.userData,
      action: PermissionAction.read,
    });

    // Header copy is rendered server-side, so we resolve it with the request's
    // locale instead of the React hook.
    const t = await getFixedT(getLocale(request));
    const title = t("accountDetails.title");
    const subHeading = t("settings.subHeading");
    const header = {
      title,
      subHeading,
    };

    return payload({ header });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export const shouldRevalidate = () => false;

export default function AccountDetailsPage() {
  const { t } = useTranslation();
  const items = [
    { to: "general", content: t("nav.general") },
    { to: "workspace", content: t("ui.workspaces") },
    { to: "calendars", content: t("ui.calendars") },
  ];

  const enablePremium = useRouteLoaderData<typeof layoutLoader>(
    "routes/_layout+/_layout",
  )?.enablePremium;

  if (enablePremium) {
    items.push({ to: "subscription", content: t("ui.subscription") });
  }

  return (
    <>
      <Header hidePageDescription />
      <HorizontalTabs items={items} />
      <div>
        <Outlet />
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
