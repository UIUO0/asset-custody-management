import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { data, Outlet, useLoaderData, useParams } from "react-router";
import { ErrorContent } from "~/components/errors";
import HorizontalTabs from "~/components/layout/horizontal-tabs";
import type { Item } from "~/components/layout/horizontal-tabs/types";
import When from "~/components/when/when";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

/**
 * Re-exported from `~/utils/roles` so the many existing importers of this route
 * keep working. New code should import from `~/utils/roles` directly — a route
 * module is the wrong home for shared data, and server modules importing it was
 * already pulling a whole route into the server bundle.
 */
export type { UserFriendlyRoles } from "~/utils/roles";
export { organizationRolesMap } from "~/utils/roles";

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
  return [{ title: appendToMetaTitle(resources.settings.teamSettingsTitle) }];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    const { currentOrganization } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      action: PermissionAction.read,
    });
    return payload({
      isPersonalOrg: currentOrganization.type === "PERSONAL",
      orgName: currentOrganization.name,
    });
  } catch (cause) {
    const reason = makeShelfError(cause);
    throw data(error(reason), { status: reason.status });
  }
};

export default function TeamSettings() {
  const { t } = useTranslation();
  const { isPersonalOrg, orgName } = useLoaderData<typeof loader>();

  const TABS: Item[] = [
    ...(!isPersonalOrg
      ? [
          { to: "users", content: t("team.users") },
          { to: "invites", content: t("team.invites") },
        ]
      : []),
    { to: "nrm", content: t("team.nonRegisteredMembers") },
  ];

  const params = useParams();

  return (
    <>
      <When truthy={!params.userId}>
        <div className="rounded border bg-white p-4 md:px-10 md:py-8">
          <h1 className="text-[18px] font-semibold">
            {isPersonalOrg
              ? t("team.title")
              : t("team.orgTeam", { name: orgName })}
          </h1>
          <p className="mb-6 text-sm text-gray-600">{t("team.manageDesc")}</p>
          <HorizontalTabs items={TABS} />
          <Outlet />
        </div>
      </When>
      <When truthy={!!params?.userId?.length}>
        <Outlet />
      </When>
    </>
  );
}
export const ErrorBoundary = () => <ErrorContent />;
