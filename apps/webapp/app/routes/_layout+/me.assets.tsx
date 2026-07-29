import { useTranslation } from "react-i18next";
import { data, type LoaderFunctionArgs, type MetaFunction } from "react-router";
import { AssetsList } from "~/components/assets/assets-index/assets-list";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getUserAssetsTabLoaderData } from "~/modules/asset/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

/**
 * Handle is used for properly displaying columns in AssetsList
 */
export const handle = {
  name: "me.assets",
};
export const meta: MetaFunction = ({ matches }: { matches: any[] }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match: any) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.nav.myAssets) }];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const userId = authSession.userId;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    const { headers, ...loaderData } = await getUserAssetsTabLoaderData({
      userId,
      request,
      organizationId,
    });

    return data(payload(loaderData), { headers });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export default function MyAssets() {
  const { t } = useTranslation();
  return (
    <AssetsList
      disableTeamMemberFilter
      disableBulkActions
      customEmptyStateContent={{
        title: t("availability.noAssetsBadge"),
        text: t("ui.youHaveNotCreatedAnyAssetsYetAndNoAssetsAreA"),
      }}
    />
  );
}
