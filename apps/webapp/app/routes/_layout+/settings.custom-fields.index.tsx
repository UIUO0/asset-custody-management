import type { Prisma } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useLoaderData } from "react-router";
import { CategoryBadge } from "~/components/assets/category-badge";
import { ActionsDropdown } from "~/components/custom-fields/actions-dropdown";
import BulkActionsDropdown from "~/components/custom-fields/bulk-actions-dropdown";
import type { HeaderData } from "~/components/layout/header/types";
import { List } from "~/components/list";
import ItemsWithViewMore from "~/components/list/items-with-view-more";
import { Badge } from "~/components/shared/badge";
import { Button } from "~/components/shared/button";
import { GrayBadge } from "~/components/shared/gray-badge";
import { Td, Th } from "~/components/table";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import {
  countActiveCustomFields,
  getFilteredAndPaginatedCustomFields,
} from "~/modules/custom-field/service.server";
import { getOrganizationTierLimit } from "~/modules/tier/service.server";

import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import {
  setCookie,
  updateCookieWithPerPage,
  userPrefs,
} from "~/utils/cookies.server";
import { FIELD_TYPE_NAME } from "~/utils/custom-fields";
import { makeShelfError } from "~/utils/error";
import { payload, error, getCurrentSearchParams } from "~/utils/http.server";
import { getParamsValues } from "~/utils/list";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { canCreateMoreCustomFields } from "~/utils/subscription.server";

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [{ title: appendToMetaTitle(resources.settings.customFieldsHeader) }];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, organizations } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.customField,
      action: PermissionAction.read,
    });

    const searchParams = getCurrentSearchParams(request);
    const { page, perPageParam, search } = getParamsValues(searchParams);
    const cookie = await updateCookieWithPerPage(request, perPageParam);
    const { perPage } = cookie;

    const { customFields, totalCustomFields } =
      await getFilteredAndPaginatedCustomFields({
        organizationId,
        page,
        perPage,
        search,
      });

    const tierLimit = await getOrganizationTierLimit({
      organizationId,
      organizations,
    });

    const totalPages = Math.ceil(totalCustomFields / perPageParam);

    const header: HeaderData = {
      title: "Custom Fields",
    };
    const modelName = {
      singular: "custom fields",
      plural: "custom Fields",
    };

    return data(
      payload({
        header,
        items: customFields,
        search,
        page,
        totalItems: totalCustomFields,
        totalPages,
        perPage,
        modelName,
        canCreateMoreCustomFields: canCreateMoreCustomFields({
          tierLimit,
          totalCustomFields: await countActiveCustomFields({ organizationId }),
        }),
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

export default function CustomFieldsIndexPage() {
  const { t } = useTranslation();
  const { canCreateMoreCustomFields } = useLoaderData<typeof loader>();
  const { isBaseOrSelfService } = useUserRoleHelper();

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between bg-white md:rounded md:border md:border-gray-200 md:px-6 md:py-5">
        <h2 className=" text-lg text-gray-900">
          {t("settings.customFieldsHeader")}
        </h2>
        <Button
          to="new"
          role="link"
          aria-label="new custom field"
          data-test-id="createNewCustomField"
          variant="primary"
          disabled={
            !canCreateMoreCustomFields
              ? {
                  reason: t("settings.cannotCreateMoreCustomFields"),
                }
              : false
          }
        >
          {t("settings.newCustomField")}
        </Button>
      </div>
      <List
        bulkActions={isBaseOrSelfService ? undefined : <BulkActionsDropdown />}
        ItemComponent={CustomFieldRow}
        headerChildren={
          <>
            <Th>{t("customFields.categories")}</Th>
            <Th>{t("customFields.required")}</Th>
            <Th>{t("customFields.status")}</Th>
            <Th>{t("customFields.usedOn")}</Th>
            <Th>{t("customFields.actions")}</Th>
          </>
        }
      />
    </>
  );
}
function CustomFieldRow({
  item,
}: {
  item: Prisma.CustomFieldGetPayload<{ include: { categories: true } }> & {
    usageCount: number;
  };
}) {
  const { t } = useTranslation();
  return (
    <>
      <Td className="w-full">
        <Link
          to={`${item.id}/edit`}
          className="block text-text-sm font-medium text-gray-900"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <span className="block">{item.name}</span>
              <span className="text-gray-600">
                {FIELD_TYPE_NAME[item.type]}
              </span>
            </div>
          </div>
        </Link>
      </Td>
      <Td>
        <ItemsWithViewMore
          items={item.categories}
          emptyMessage={<GrayBadge>{t("common.all")}</GrayBadge>}
          renderItem={(category) => (
            <CategoryBadge
              category={category}
              className="mb-2 me-2"
              key={category.id}
            />
          )}
        />
      </Td>
      <Td>
        <span className="text-text-sm font-medium capitalize text-gray-600">
          {item.required ? t("common.yes") : t("common.no")}
        </span>
      </Td>
      <Td>
        {!item.active ? (
          <Badge color="#dc2626" withDot={false}>
            {t("customFields.inactive")}
          </Badge>
        ) : (
          <Badge color="#059669" withDot={false}>
            {t("customFields.active")}
          </Badge>
        )}
      </Td>
      <Td>
        <span className="text-text-sm font-medium text-gray-600">
          {t("models.asset", { count: item.usageCount })}
        </span>
      </Td>
      <Td>
        <ActionsDropdown customField={item} />
      </Td>
    </>
  );
}
