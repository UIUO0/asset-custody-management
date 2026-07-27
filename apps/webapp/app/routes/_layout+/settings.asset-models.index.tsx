/**
 * Route: Asset Models Index
 *
 * Displays the paginated list of asset models with search and bulk actions.
 *
 * @see {@link file://./settings.asset-models.tsx} Parent layout
 */
import type { AssetModel, Category } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data } from "react-router";
import AssetModelQuickActions from "~/components/asset-model/asset-model-quick-actions";
import AssetModelBulkActionsDropdown from "~/components/asset-model/bulk-actions-dropdown";
import type { HeaderData } from "~/components/layout/header/types";
import LineBreakText from "~/components/layout/line-break-text";
import { List } from "~/components/list";
import { Badge } from "~/components/shared/badge";
import { Button } from "~/components/shared/button";
import { Th, Td } from "~/components/table";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getAssetModels } from "~/modules/asset-model/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import {
  setCookie,
  updateCookieWithPerPage,
  userPrefs,
} from "~/utils/cookies.server";
import { makeShelfError } from "~/utils/error";
import { payload, error, getCurrentSearchParams } from "~/utils/http.server";
import { getParamsValues } from "~/utils/list";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator.client";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.assetModel,
      action: PermissionAction.read,
    });

    const searchParams = getCurrentSearchParams(request);
    const { page, perPageParam, search } = getParamsValues(searchParams);
    const cookie = await updateCookieWithPerPage(request, perPageParam);
    const { perPage } = cookie;

    const { assetModels, totalAssetModels } = await getAssetModels({
      organizationId,
      page,
      perPage,
      search,
    });
    const totalPages = Math.ceil(totalAssetModels / perPage);

    const header: HeaderData = {
      title: "Asset Models",
      subHeading:
        "Asset models are templates for grouping similar assets. Use them to define default values and track groups of identical items like laptop models or equipment types.",
    };
    const modelName = {
      singular: "asset model",
      plural: "asset models",
    };

    return data(
      payload({
        header,
        items: assetModels,
        search,
        page,
        totalItems: totalAssetModels,
        totalPages,
        perPage,
        modelName,
      }),
      {
        headers: [setCookie(await userPrefs.serialize(cookie))],
      },
    );
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
  return [{ title: appendToMetaTitle(resources.assetModels.title) }];
};

export default function AssetModelsIndexPage() {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();
  const canBulkManage = userHasPermission({
    roles,
    entity: PermissionEntity.assetModel,
    action: PermissionAction.delete,
  });

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between bg-white md:rounded md:border md:border-gray-200 md:px-6 md:py-5">
        <div>
          <h2 className="text-lg text-gray-900">{t("assetModels.title")}</h2>
          <p className="text-sm text-gray-600">{t("assetModels.indexDesc")}</p>
        </div>
        <Button
          to="new"
          role="link"
          aria-label="new asset model"
          data-test-id="createNewAssetModel"
        >
          {t("assetModels.newAssetModel")}
        </Button>
      </div>
      <List
        bulkActions={
          canBulkManage ? <AssetModelBulkActionsDropdown /> : undefined
        }
        ItemComponent={AssetModelItem}
        headerChildren={
          <>
            <Th>{t("assetModels.description")}</Th>
            <Th>{t("assetModels.defaultCategory")}</Th>
            <Th>{t("assetModels.assets")}</Th>
            <Th>{t("assetModels.actions")}</Th>
          </>
        }
      />
    </>
  );
}

/** Renders a single row in the asset models list table. */
const AssetModelItem = ({
  item,
}: {
  item: Pick<AssetModel, "id" | "description" | "name"> & {
    _count: {
      assets: number;
    };
    defaultCategory?: Pick<Category, "id" | "name" | "color"> | null;
  };
}) => {
  const { t } = useTranslation();
  return (
    <>
      <Td
        title={t("assetModels.assetModelTooltip", { name: item.name })}
        className="w-1/4"
      >
        {item.name}
      </Td>
      <Td className="max-w-62 md:w-2/4">
        {item.description ? (
          <LineBreakText
            className="md:w-3/4"
            text={item.description}
            numberOfLines={3}
            charactersPerLine={60}
          />
        ) : null}
      </Td>
      <Td>
        {item.defaultCategory ? (
          <Badge color={item.defaultCategory.color} withDot={false}>
            {item.defaultCategory.name}
          </Badge>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </Td>
      <Td>{item._count.assets}</Td>
      <Td>
        <AssetModelQuickActions assetModel={item} />
      </Td>
    </>
  );
};
