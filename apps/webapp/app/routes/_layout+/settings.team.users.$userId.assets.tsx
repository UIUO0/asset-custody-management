import { useTranslation } from "react-i18next";
import { data } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { z } from "zod";
import { AssetsList } from "~/components/assets/assets-index/assets-list";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getUserAssetsTabLoaderData } from "~/modules/asset/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error, getParams } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction = ({ matches }: { matches: any[] }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match: any) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.team.memberAssetsTitle) }];
};

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMemberProfile,
      action: PermissionAction.read,
    });

    const { userId: selectedUserId } = getParams(
      params,
      z.object({ userId: z.string() }),
      {
        additionalData: { userId },
      },
    );

    const { headers, ...loaderData } = await getUserAssetsTabLoaderData({
      userId: selectedUserId,
      request,
      organizationId,
    });

    return data(payload(loaderData), { headers });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export default function UserAssetsPage() {
  const { t } = useTranslation();
  return (
    <AssetsList
      disableTeamMemberFilter
      disableBulkActions
      customEmptyStateContent={{
        title: t("team.noAssetsTitle"),
        text: t("team.noAssetsText"),
      }}
    />
  );
}

export const handle = {
  name: "$userId.assets",
};
