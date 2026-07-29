import type { Category } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, Link, Outlet } from "react-router";
import { z } from "zod";
import BulkActionsDropdown from "~/components/category/bulk-actions-dropdown";
import CategoryQuickActions from "~/components/category/category-quick-actions";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import LineBreakText from "~/components/layout/line-break-text";
import { List } from "~/components/list";
import { ListContentWrapper } from "~/components/list/content-wrapper";
import { Filters } from "~/components/list/filters";
import { Badge } from "~/components/shared/badge";
import { Button } from "~/components/shared/button";
import { Th, Td } from "~/components/table";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import {
  deleteCategory,
  getCategories,
} from "~/modules/category/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import {
  setCookie,
  updateCookieWithPerPage,
  userPrefs,
} from "~/utils/cookies.server";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { computeHasActiveFilters } from "~/utils/filter-params";
import {
  payload,
  error,
  getCurrentSearchParams,
  parseData,
} from "~/utils/http.server";
import { getParamsValues } from "~/utils/list";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.category,
      action: PermissionAction.read,
    });

    const searchParams = getCurrentSearchParams(request);
    const { page, perPageParam, search } = getParamsValues(searchParams);
    const hasActiveFilters = computeHasActiveFilters(searchParams);
    const cookie = await updateCookieWithPerPage(request, perPageParam);
    const { perPage } = cookie;

    const { categories, totalCategories } = await getCategories({
      organizationId,
      page,
      perPage,
      search,
    });
    const totalPages = Math.ceil(totalCategories / perPage);

    const header: HeaderData = {
      title: "Categories",
    };
    const modelName = {
      singular: "category",
      plural: "categories",
    };

    return data(
      payload({
        header,
        items: categories,
        search,
        page,
        totalItems: totalCategories,
        totalPages,
        perPage,
        modelName,
        hasActiveFilters,
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

  return [{ title: appendToMetaTitle(resources.nav.categories) }];
};

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.category,
      action: PermissionAction.delete,
    });

    const { id } = parseData(
      await request.formData(),
      z.object({
        id: z.string(),
      }),
      {
        additionalData: { userId },
      },
    );

    await deleteCategory({ id, organizationId });

    sendNotification({
      title: "Category deleted",
      message: "Your category has been deleted successfully",
      icon: { name: "trash", variant: "error" },
      senderId: userId,
    });

    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

/** Breadcrumb link for the categories section (component so it can use the hook). */
function CategoriesBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/categories">{t("nav.categories")}</Link>;
}

export const handle = {
  breadcrumb: () => <CategoriesBreadcrumb />,
};
export const ErrorBoundary = () => <ErrorContent />;

export default function CategoriesPage() {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();
  // Bulk actions on this screen are destructive; gate on the same permission
  // the delete action enforces rather than on "is this an admin?".
  const canBulkManage = userHasPermission({
    roles,
    entity: PermissionEntity.category,
    action: PermissionAction.delete,
  });

  return (
    <>
      <Header title={t("nav.categories")}>
        <Button
          to="new"
          role="link"
          aria-label={`new category`}
          data-test-id="createNewCategory"
        >
          {t("categories.newCategory")}
        </Button>
      </Header>
      <ListContentWrapper>
        <Filters />
        <Outlet />
        <List
          bulkActions={canBulkManage ? <BulkActionsDropdown /> : undefined}
          customEmptyStateContent={{
            title: t("categories.emptyTitle"),
            text: t("categories.emptyText"),
            newButtonRoute: "/categories/new",
            newButtonContent: t("categories.emptyCta"),
          }}
          ItemComponent={CategoryItem}
          headerChildren={
            <>
              <Th>{t("assets.description")}</Th>
              <Th>{t("nav.assets")}</Th>
              <Th>{t("list.actions")}</Th>
            </>
          }
        />
      </ListContentWrapper>
    </>
  );
}

const CategoryItem = ({
  item,
}: {
  item: Pick<Category, "id" | "description" | "name" | "color"> & {
    _count: {
      assets: number;
    };
  };
}) => (
  <>
    <Td title={`Category: ${item.name}`} className="w-1/4">
      <Badge color={item.color} withDot={false}>
        {item.name}
      </Badge>
    </Td>
    <Td className="max-w-62 md:w-3/4">
      {item.description ? (
        <LineBreakText
          className="md:w-3/4"
          text={item.description}
          numberOfLines={3}
          charactersPerLine={60}
        />
      ) : null}
    </Td>
    <Td>{item._count.assets}</Td>
    <Td>
      <CategoryQuickActions category={item} />
    </Td>
  </>
);
