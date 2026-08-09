import type { ReactNode } from "react";
import { useMemo } from "react";
import { m } from "framer-motion";
import { Package } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { useFetcher, useFetchers } from "react-router";
import { List, type ListProps } from "~/components/list";
import { ListContentWrapper } from "~/components/list/content-wrapper";
import { LocationBadge } from "~/components/location/location-badge";
import { Button } from "~/components/shared/button";
import { EmptyTableValue } from "~/components/shared/empty-table-value";
import { GrayBadge } from "~/components/shared/gray-badge";
import { InfoTooltip } from "~/components/shared/info-tooltip";
import { Spinner } from "~/components/shared/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/shared/tooltip";
import { Th, Td } from "~/components/table";
import { TeamMemberBadge } from "~/components/user/team-member-badge";
import When from "~/components/when/when";
import { useAssetIndexColumns } from "~/hooks/use-asset-index-columns";
import { useAssetIndexViewState } from "~/hooks/use-asset-index-view-state";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { useDisabled } from "~/hooks/use-disabled";
import { useIsUserAssetsPage } from "~/hooks/use-is-user-assets-page";
import { useViewportHeight } from "~/hooks/use-viewport-height";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import type { AssetsFromViewItem } from "~/modules/asset/types";
import { getPrimaryLocation, isQuantityTracked } from "~/modules/asset/utils";
import { resolveDisplayCode } from "~/modules/barcode/display";
import { formatCustodyList } from "~/modules/custody/utils";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { tw } from "~/utils/tw";
import { AssetCodeBadge } from "../asset-code-badge";
import { AssetImage } from "../asset-image";
import { AssetStatusBadge } from "../asset-status-badge";
import BulkActionsDropdown from "../bulk-actions-dropdown";
import { AdvancedAssetRow } from "./advanced-asset-row";
import { AdvancedTableHeader } from "./advanced-table-header";
import { AssetIndexPagination } from "./asset-index-pagination";
import AssetQuickActions from "./asset-quick-actions";
import { AssetIndexFilters } from "./filters";
import { ListItemTagsColumn } from "./list-item-tags-column";
import { CategoryBadge } from "../category-badge";

export const AssetsList = ({
  customEmptyStateContent,
  disableTeamMemberFilter,
  disableBulkActions,
  wrapperClassName,
}: {
  customEmptyStateContent?: ListProps["customEmptyStateContent"];
  disableTeamMemberFilter?: boolean;
  disableBulkActions?: boolean;
  wrapperClassName?: string;
}) => {
  const { t } = useTranslation();
  // We use the hook because it handles optimistic UI
  const { modeIsSimple } = useAssetIndexViewState();
  const columns = useAssetIndexColumns();
  // Memoize so the object reference stays stable across re-renders,
  // allowing React.memo on AdvancedAssetRow to work effectively.
  const advancedExtraProps = useMemo(() => ({ columns }), [columns]);
  const { isMd } = useViewportHeight();
  const isUserPage = useIsUserAssetsPage();
  const { roles } = useUserRoleHelper();
  /**
   * The bulk dropdown gates each of its own entries; this only decides whether
   * ANY of them apply. Covers all three write shapes so no role is shown an
   * empty dropdown, and none is denied one it can use — INVENTORY reaches it
   * through `delete` alone.
   */
  const canBulkManageAssets = userHasPermission({
    roles,
    entity: PermissionEntity.asset,
    action: [
      PermissionAction.update,
      PermissionAction.custody,
      PermissionAction.delete,
    ],
  });
  const fetchers = useFetchers();
  /** Find the fetcher used for toggling between asset index modes */
  const modeFetcher = fetchers.find(
    (fetcher) => fetcher.key === "asset-index-settings-mode",
  );
  const isSwappingMode = modeFetcher?.formData;
  const headerChildren = modeIsSimple ? (
    <>
      <Th>{t("assets.category")}</Th>
      <Th>{t("assets.tags")}</Th>
      <When truthy={!isUserPage}>
        <Th className="flex items-center gap-1 whitespace-nowrap">
          {t("assets.custodian")}{" "}
          <InfoTooltip
            iconClassName="size-4"
            content={
              <>
                <h6>{t("assets.custodyTooltipTitle")}</h6>
                <p>
                  <Trans
                    i18nKey="assets.custodyTooltipBody"
                    components={{ badge: <GrayBadge /> }}
                  />
                </p>
              </>
            }
          />
        </Th>
      </When>
      <Th>{t("assets.location")}</Th>
      <Th>{t("assets.quantity")}</Th>
      <Th>{t("assets.actions")}</Th>
    </>
  ) : (
    <AdvancedTableHeader columns={columns} />
  );

  return (
    <div
      className={tw(
        "flex flex-col",
        modeIsSimple ? "gap-4 pb-5 pt-4" : "gap-2 py-2",
        wrapperClassName,
        isSwappingMode && "overflow-hidden",
      )}
    >
      <When truthy={!!isSwappingMode}>
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute inset-0 z-[100] flex flex-col items-center  bg-gray-25/95 pt-[30vh]"
        >
          <Spinner />
          <p className="mt-2">{t("assetsIndex.changingMode")}</p>
        </m.div>
      </When>

      {!isMd && !modeIsSimple ? (
        <AdvancedModeMobileFallback />
      ) : (
        <ListContentWrapper className="md:mt-0">
          <AssetIndexFilters
            disableTeamMemberFilter={disableTeamMemberFilter}
          />
          <List
            title={t("nav.assets")}
            ItemComponent={modeIsSimple ? ListAssetContent : AdvancedAssetRow}
            customPagination={<AssetIndexPagination />}
            bulkActions={
              disableBulkActions || !canBulkManageAssets ? undefined : (
                <BulkActionsDropdown />
              )
            }
            customEmptyStateContent={
              customEmptyStateContent ? customEmptyStateContent : undefined
            }
            headerChildren={headerChildren}
            extraItemComponentProps={
              modeIsSimple ? undefined : advancedExtraProps
            }
          />
        </ListContentWrapper>
      )}
    </div>
  );
};

export const ListAssetContent = ({
  item,
  bulkActions,
  isUserPage,
}: {
  item: AssetsFromViewItem;
  bulkActions?: ReactNode;
  isUserPage?: boolean;
}) => {
  const { category, tags, custody: custodyArray } = item;
  // Render only the single primary-location badge in the list column —
  // a qty-tracked asset can sit at multiple locations via AssetLocation.
  const location = getPrimaryLocation(item);
  const kit = item.assetKits?.[0]?.kit ?? null;
  const {
    primary: primaryCustody,
    others: otherCustodians,
    total: totalCustodians,
  } = formatCustodyList(custodyArray);
  const currentOrganization = useCurrentOrganization();
  const displayCode = currentOrganization
    ? resolveDisplayCode({ entity: item, organization: currentOrganization })
    : null;
  return (
    <>
      {/* Item */}
      <Td className="w-full whitespace-normal p-0 md:p-0">
        <div
          className={tw(
            "flex justify-between gap-3 py-4  md:justify-normal",
            bulkActions ? "md:pe-6 md:ps-0" : "md:px-6",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex size-14 shrink-0 items-center justify-center">
              <AssetImage
                asset={{
                  id: item.id,
                  mainImage: item.mainImage,
                  thumbnailImage: item.thumbnailImage,
                  mainImageExpiration: item.mainImageExpiration,
                }}
                alt={`Image of ${item.title}`}
                className="size-full rounded-[4px] border object-cover"
                withPreview
              />

              {kit?.id ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 border-static-white bg-gray-200">
                        <Package className="size-2" />
                      </div>
                    </TooltipTrigger>

                    <TooltipContent side="top">
                      <p className="text-sm">{kit.name}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
            <div className="min-w-[130px]">
              <span className="word-break mb-1 block ">
                <Button
                  to={`/assets/${item.id}`}
                  variant="link"
                  className="text-start font-medium text-gray-900 hover:text-gray-700"
                >
                  {item.title}
                </Button>
              </span>
              {/*
                Single metadata line: status badge first (most glanceable —
                color + word), code chip second (identification reference).
                Reads as paired metadata, frees a row of vertical space vs.
                the previous three-stack layout. `flex-wrap` keeps the layout
                safe when code/status are long on narrow viewports.
              */}
              <div className="flex flex-wrap items-center gap-2">
                <AssetStatusBadge
                  id={item.id}
                  status={item.status}
                  availableToBook={item.availableToBook}
                  asset={item}
                />
                {displayCode ? <AssetCodeBadge {...displayCode} /> : null}
              </div>
            </div>
          </div>
        </div>
      </Td>

      {/* Category */}
      <Td>
        <CategoryBadge category={category} />
      </Td>

      {/* Tags */}
      <Td className="text-start">
        <ListItemTagsColumn tags={tags} />
      </Td>

      {/* Custodian */}
      <When truthy={!isUserPage}>
        <Td>
          {!primaryCustody || totalCustodians === 0 ? (
            <EmptyTableValue />
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex min-w-0 items-center">
                <TeamMemberBadge teamMember={primaryCustody.custodian} />
                {primaryCustody.quantity && primaryCustody.quantity > 1 ? (
                  <span className="ms-1 shrink-0 text-gray-500">
                    ({primaryCustody.quantity})
                  </span>
                ) : null}
              </span>
              {otherCustodians.length > 0 ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="shrink-0 cursor-help whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        +{otherCustodians.length} more
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <ul className="flex flex-col gap-1 text-sm">
                        {[primaryCustody, ...otherCustodians].map((entry) => {
                          const name = entry.custodian?.name ?? "Unknown";
                          const qty = entry.quantity;
                          // why: Custody rows carry their own `id`; fall back
                          // to a name+qty composite only when missing (the
                          // upstream `formatCustodyList` type is generic, so
                          // TS can't prove `id` is present without a cast).
                          const key =
                            (entry as { id?: string }).id ?? `${name}-${qty}`;
                          return (
                            <li key={key}>
                              {name}
                              {qty && qty > 1 ? ` (${qty})` : null}
                            </li>
                          );
                        })}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </span>
          )}
        </Td>
      </When>

      {/* Location */}
      <Td>
        {location ? (
          <LocationBadge
            location={{
              id: location.id,
              name: location.name,
              parentId: location.parentId ?? undefined,
              childCount: location._count?.children ?? 0,
            }}
          />
        ) : (
          <EmptyTableValue />
        )}
      </Td>

      {/* Quantity */}
      <Td>
        {isQuantityTracked(item) && item.quantity != null ? (
          <span>
            {item.quantity}
            {item.unitOfMeasure ? ` ${item.unitOfMeasure}` : ""}
          </span>
        ) : (
          <EmptyTableValue />
        )}
      </Td>

      {/* Quick Actions */}
      <Td>
        <AssetQuickActions
          asset={{
            ...item,
            qrId: item.qrCodes?.[0]?.id,
          }}
        />
      </Td>
    </>
  );
};

function AdvancedModeMobileFallback() {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const disabled = useDisabled(fetcher);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <p className="text-center">
        {t("ui.advancedModeIsCurrentlyNotAvailableOnMobile")}
      </p>
      <fetcher.Form
        method="post"
        action="/api/asset-index-settings"
        onSubmit={() => {
          window.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        }}
      >
        <input type="hidden" name="intent" value="changeMode" />

        <Button type="submit" name="mode" value="SIMPLE" disabled={disabled}>
          {t("ui.changeToSimpleMode")}
        </Button>
      </fetcher.Form>
    </div>
  );
}
