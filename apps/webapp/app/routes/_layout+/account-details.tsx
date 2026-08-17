import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import { getFixedT, getLocale } from "~/i18n/i18n.server";
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

/**
 * The signed-in user's own account.
 *
 * One section, so no tab strip: three of the four upstream tabs do not apply
 * to this deployment and one of them never had a route at all.
 *
 * - **الاشتراكات** — a Stripe plan. The authority runs this system itself.
 * - **مساحات العمل** — creating and switching workspaces. There is exactly one
 *   workspace, the authority's, and it is not something an employee creates.
 * - **التقويمات** — pointed at `/account-details/calendars`, which **does not
 *   exist**; the calendar left with the booking system. Clicking it landed on
 *   the not-found page.
 */
export default function AccountDetailsPage() {
  return (
    <>
      <Header hidePageDescription />
      <div>
        <Outlet />
      </div>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
