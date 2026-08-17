import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, Outlet, useLoaderData, useMatches } from "react-router";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import HorizontalTabs from "~/components/layout/horizontal-tabs";
import When from "~/components/when/when";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { getFixedT, getLocale } from "~/i18n/i18n.server";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { SETTINGS_SECTIONS } from "~/modules/settings/sections";
import type { RouteHandleWithName } from "~/modules/types";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import { isPersonalOrg } from "~/utils/organization";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { requireAnyPermission } from "~/utils/roles.server";

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
    /**
     * Admission is "can you open *any* section", not "can you read the general
     * settings".
     *
     * The tab strip below has always been per-section — the comment on it even
     * names المخزون as seeing only "الحقول المخصّصة" — but this gate demanded
     * `generalSettings.read` from everyone, so nobody but a workspace admin
     * ever reached the component that draws it. The visible symptom was in the
     * sidebar: «الفريق» is shown on `teamMember.read`, which المستودعات،
     * المالية، المخزون and الإدارة all hold, and clicking it answered
     * *Unauthorized* for all four.
     *
     * Each child route still enforces its own permission, so this only decides
     * who gets as far as the tabs.
     */
    const { currentOrganization } = await requireAnyPermission({
      userId: authSession.userId,
      request,
      permissions: SETTINGS_SECTIONS.map(({ entity, action }) => ({
        entity,
        action,
      })),
    });

    // Header copy is rendered server-side, so we resolve it with the request's
    // locale instead of the React hook.
    const t = await getFixedT(getLocale(request));
    const title = t("settings.title");
    const subHeading = t("settings.subHeading");
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
  const { roles } = useUserRoleHelper();

  /**
   * Draw only the tabs this role can actually open.
   *
   * Built from the same `SETTINGS_SECTIONS` the loader gates on, so a section
   * cannot be admissible-but-undrawn (or drawn-but-inadmissible) again. The
   * previous hand-written copy had drifted twice: it still listed a
   * «الحجوزات» tab whose route was removed with the booking system, and it
   * gated that tab on `generalSettings.read`.
   */
  const items = SETTINGS_SECTIONS.filter(
    (section) =>
      !(section.organizationOnly && _isPersonalOrg) &&
      userHasPermission({
        roles,
        entity: section.entity,
        action: section.action,
      }),
  ).map((section) => ({ to: section.to, content: t(section.labelKey) }));

  const matches = useMatches();
  const currentRoute: RouteHandleWithName = matches[matches.length - 1];
  return (
    <>
      <Header title={t("settings.title")} hidePageDescription />
      {/*
        A strip of one tab is a strip that decides nothing — it just repeats
        the page title in a second style. Now that الفريق is the only section
        left, the strip is drawn only if a second one ever comes back.

        The `$userId.*` exclusion is separate and still needed: those are the
        drill-down pages *inside* الفريق, and they have their own tabs.
      */}
      <When
        truthy={
          items.length > 1 &&
          !["$userId.assets", "$userId.notes"].includes(
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
