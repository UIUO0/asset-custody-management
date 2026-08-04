/**
 * "Available assets" page (الأصناف المتاحة حالياً)
 *
 * The employee-facing counterpart to "my custody": *what can I ask for right
 * now?* The full asset index answers a different question — it is an inventory
 * tool with filters, columns and bulk actions — so it buries the one thing an
 * employee actually needs.
 *
 * Availability here means three things at once, and all three are enforced in
 * the query rather than filtered afterwards, so the count and the paging stay
 * truthful:
 *
 * 1. **Released** — `lifecycleStage: READY`. Assets still in the warehouse's
 *    intake queue are not offered to anyone.
 * 2. **Free** — status `AVAILABLE`: not in someone's custody, not checked out.
 * 3. **Requestable** — flagged bookable, because raising a booking is the only
 *    way an employee can ask for an asset. Custody is handed over by the
 *    warehouse, never self-served.
 *
 * @see {@link file://./my-custody.tsx} the other half of the employee's view
 */

import { AssetStatus } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, data, useLoaderData } from "react-router";
import { AssetImage } from "~/components/assets/asset-image/component";
import { ErrorContent } from "~/components/errors";
import Input from "~/components/forms/input";
import Header from "~/components/layout/header";
import { Badge } from "~/components/shared/badge";
import { Button } from "~/components/shared/button";
import { EmptyTableValue } from "~/components/shared/empty-table-value";
import { Table, Td, Th, Tr } from "~/components/table";
import { useSearchParams } from "~/hooks/search-params";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getAssets } from "~/modules/asset/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

/** Rows per page — a browsing list, not an inventory export. */
const PER_PAGE = 20;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    const url = new URL(request.url);
    const search = url.searchParams.get("s")?.trim() || null;
    const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);

    const { assets, totalAssets } = await getAssets({
      organizationId,
      page,
      perPage: PER_PAGE,
      orderBy: "title",
      orderDirection: "asc",
      search,
      status: AssetStatus.AVAILABLE,
      availableToBookOnly: true,
      /**
       * Operational roles keep seeing the intake queue everywhere else, but on
       * *this* page the question is "what can be requested", and a PENDING
       * asset cannot be — so it is hidden regardless of who is looking.
       */
      onlyReadyAssets: true,
      extraInclude: { category: true },
    });

    return payload({
      // `<Header/>` reads this off loader data rather than taking it as a prop.
      header: { title: "Available assets" },
      assets,
      totalAssets,
      page,
      perPage: PER_PAGE,
      search,
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
  return [{ title: appendToMetaTitle(resources.nav.availableAssets) }];
};

export const ErrorBoundary = () => <ErrorContent />;

/** Shape of one row, narrowed from the shared asset service. */
type AvailableAsset = Awaited<ReturnType<typeof loader>>["assets"][number];

export default function AvailableAssetsPage() {
  const { t } = useTranslation();
  const { assets, totalAssets, page, perPage, search } =
    useLoaderData<typeof loader>();

  const totalPages = Math.max(1, Math.ceil(totalAssets / perPage));

  return (
    <>
      <Header title={t("nav.availableAssets")} hidePageDescription />

      <div className="mt-4 rounded-lg border border-gray-200 bg-white">
        <div className="border-b px-6 py-4">
          <h2 className="text-[16px] font-semibold text-gray-900">
            {t("availableAssets.heading")}
          </h2>
          <p className="mt-1 text-[14px] text-gray-600">
            {t("availableAssets.description")}
          </p>

          {/*
            A GET form so the search lands in the URL: the result stays
            shareable and survives a reload, and `page` resets naturally
            because it is not carried in the form.
          */}
          <Form method="get" className="mt-4 flex max-w-md gap-2">
            <Input
              label={t("availableAssets.searchLabel")}
              hideLabel
              name="s"
              defaultValue={search ?? ""}
              placeholder={t("availableAssets.searchPlaceholder")}
              className="flex-1"
            />
            <Button type="submit" variant="secondary">
              {t("common.search")}
            </Button>
          </Form>
        </div>

        {assets.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[14px] font-medium text-gray-900">
              {search
                ? t("availableAssets.noMatchTitle")
                : t("availableAssets.emptyTitle")}
            </p>
            <p className="mt-1 text-[14px] text-gray-600">
              {search
                ? t("availableAssets.noMatchDescription")
                : t("availableAssets.emptyDescription")}
            </p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("myCustody.asset")}</Th>
                <Th>{t("assets.category")}</Th>
                <Th className="text-end">{t("availableAssets.quantity")}</Th>
                <Th className="text-end">{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <AvailableAssetRow key={asset.id} asset={asset} />
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[14px] text-gray-500">
          {t("availableAssets.total", { count: totalAssets })}
        </p>
        <Pagination page={page} totalPages={totalPages} search={search} />
      </div>
    </>
  );
}

/** Previous / next links that preserve the active search. */
function Pagination({
  page,
  totalPages,
  search,
}: {
  page: number;
  totalPages: number;
  search: string | null;
}) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  if (totalPages <= 1) {
    return null;
  }

  const linkTo = (target: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(target));
    if (search) {
      next.set("s", search);
    }
    return `?${next.toString()}`;
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        to={linkTo(page - 1)}
        variant="secondary"
        disabled={page <= 1}
        className="text-sm"
      >
        {t("common.previous")}
      </Button>
      <span className="text-[14px] text-gray-600">
        {t("availableAssets.pageOf", { page, totalPages })}
      </span>
      <Button
        to={linkTo(page + 1)}
        variant="secondary"
        disabled={page >= totalPages}
        className="text-sm"
      >
        {t("common.next")}
      </Button>
    </div>
  );
}

/** One requestable asset. */
function AvailableAssetRow({ asset }: { asset: AvailableAsset }) {
  const { t } = useTranslation();

  /**
   * `getAssets` returns the row shape of the shared asset service, which is
   * wider than this page needs; read the two optional relations defensively
   * rather than widening the page's type to the whole index payload.
   */
  const category = "category" in asset ? asset.category : null;
  const quantity = "quantity" in asset ? asset.quantity : null;
  const unitOfMeasure = "unitOfMeasure" in asset ? asset.unitOfMeasure : null;

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-3">
          <AssetImage
            asset={{ id: asset.id, thumbnailImage: asset.thumbnailImage }}
            alt={asset.title}
            className="size-10 shrink-0 rounded border object-cover"
          />
          <div className="min-w-0">
            <Button
              to={`/assets/${asset.id}/overview`}
              variant="link"
              className="text-start font-medium text-gray-900 hover:text-gray-700"
            >
              {asset.title}
            </Button>
            {asset.sequentialId ? (
              <p className="text-xs text-gray-500">{asset.sequentialId}</p>
            ) : null}
          </div>
        </div>
      </Td>

      <Td>
        {category ? (
          <Badge color={category.color} withDot={false}>
            {category.name}
          </Badge>
        ) : (
          <EmptyTableValue />
        )}
      </Td>

      <Td className="whitespace-nowrap text-end">
        {quantity != null ? (
          <>
            {quantity}
            {unitOfMeasure ? ` ${unitOfMeasure}` : ""}
          </>
        ) : (
          <EmptyTableValue />
        )}
      </Td>

      <Td className="text-end">
        <Button
          to={`/bookings/new?assetId=${asset.id}`}
          variant="secondary"
          className="text-sm"
        >
          {t("availableAssets.request")}
        </Button>
      </Td>
    </Tr>
  );
}
