import { AssetStatus } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { StatusFilter } from "~/components/booking/status-filter";
import DynamicDropdown from "~/components/dynamic-dropdown/dynamic-dropdown";
import { ChevronRight } from "~/components/icons/library";
import ImageWithPreview from "~/components/image-with-preview/image-with-preview";
import { Filters } from "~/components/list/filters";
import { SortBy } from "~/components/list/filters/sort-by";
import { Button } from "~/components/shared/button";
import When from "~/components/when/when";
import {
  useClearValueFromParams,
  useSearchParamHasValue,
} from "~/hooks/search-params";
import { useAssetIndexViewState } from "~/hooks/use-asset-index-view-state";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { userHasCustodyViewPermission } from "~/utils/permissions/custody-and-bookings-permissions.validator.client";
import type { OrganizationPermissionSettings } from "~/utils/permissions/custody-and-bookings-permissions.validator.client";
import { resolveTeamMemberName } from "~/utils/user";
import { AdvancedFilteringAndSorting } from "./advanced-asset-index-filters-and-sorting";
import { ConfigureColumnsDropdown } from "./configure-columns-dropdown";
import { SavedFilterPresetsControls } from "./saved-filter-presets";
import { AvailabilityViewToggle } from "./view-toggle";

/**
 * Sorting options for asset lists, with translated labels.
 *
 * A hook rather than a const so the labels follow the active locale.
 * The keys are the DB columns the loader sorts by — do not translate those.
 *
 * @returns Map of sortable column → localised label
 */
export function useAssetSortingOptions() {
  const { t } = useTranslation();
  return {
    title: t("list.sortName"),
    createdAt: t("list.sortDateCreated"),
    updatedAt: t("list.sortDateUpdated"),
  } as const;
}

export function AssetIndexFilters({
  disableTeamMemberFilter,
}: {
  disableTeamMemberFilter?: boolean;
}) {
  /** Used for filtering based on user type */
  const filterParams: string[] = ["category", "tag", "location"];
  if (!disableTeamMemberFilter) {
    filterParams.push("teamMember");
  }
  const { t } = useTranslation();
  const hasFiltersToClear = useSearchParamHasValue(...filterParams);
  const clearFilters = useClearValueFromParams(...filterParams);
  const { roles } = useUserRoleHelper();
  const assetSortingOptions = useAssetSortingOptions();

  const { modeIsSimple, modeIsAdvanced } = useAssetIndexViewState();

  const organization = useCurrentOrganization();
  const canSeeAllCustody = userHasCustodyViewPermission({
    roles,
    organization: organization as OrganizationPermissionSettings, // Here we can be sure as TeamMemberBadge is only used in the context of an organization/logged in route
  });

  if (modeIsSimple) {
    return (
      <Filters
        slots={{
          "left-of-search": <StatusFilter statusItems={AssetStatus} />,
          "right-of-search": (
            <div className="flex items-center gap-2">
              <SortBy
                sortingOptions={assetSortingOptions}
                defaultSortingBy="createdAt"
                className="flex-1"
              />

              <AvailabilityViewToggle />
            </div>
          ),
        }}
      >
        <div className="flex w-full items-center justify-around gap-6 md:w-auto md:justify-end">
          {hasFiltersToClear ? (
            <div className="hidden gap-6 md:flex">
              <Button
                as="button"
                onClick={clearFilters}
                variant="link"
                className="block min-w-28 max-w-none font-normal text-gray-600 hover:text-gray-700"
                type="button"
              >
                {t("list.clearAllFilters")}
              </Button>
              <div className="text-gray-600"> | </div>
            </div>
          ) : null}
          <div className="flex w-full items-center justify-around gap-2 p-3 md:w-auto md:justify-end md:p-0 lg:gap-4">
            <DynamicDropdown
              trigger={
                <div className="flex cursor-pointer items-center gap-2">
                  {t("assets.category")}{" "}
                  <ChevronRight className="hidden rotate-90 md:inline" />
                </div>
              }
              model={{ name: "category", queryKey: "name" }}
              label={t("list.filterByCategory")}
              placeholder={t("list.searchCategories")}
              initialDataKey="categories"
              countKey="totalCategories"
              withoutValueItem={{
                id: "uncategorized",
                name: t("list.uncategorized"),
              }}
            />
            <DynamicDropdown
              trigger={
                <div className="flex cursor-pointer items-center gap-2">
                  {t("assets.tags")}{" "}
                  <ChevronRight className="hidden rotate-90 md:inline" />
                </div>
              }
              model={{ name: "tag", queryKey: "name" }}
              label={t("list.filterByTag")}
              initialDataKey="tags"
              countKey="totalTags"
              withoutValueItem={{
                id: "untagged",
                name: t("list.withoutTag"),
              }}
            />
            <DynamicDropdown
              trigger={
                <div className="flex cursor-pointer items-center gap-2">
                  {t("nav.locations")}{" "}
                  <ChevronRight className="hidden rotate-90 md:inline" />
                </div>
              }
              model={{ name: "location", queryKey: "name" }}
              label={t("list.filterByLocation")}
              initialDataKey="locations"
              countKey="totalLocations"
              withoutValueItem={{
                id: "without-location",
                name: t("list.withoutLocation"),
              }}
              renderItem={({ metadata }) => (
                <div className="flex items-center gap-2">
                  <ImageWithPreview
                    thumbnailUrl={metadata.thumbnailUrl}
                    alt={metadata.name}
                    className="size-6 rounded-[2px]"
                  />
                  <div>{metadata.name}</div>
                </div>
              )}
            />
            <When truthy={canSeeAllCustody && !disableTeamMemberFilter}>
              <DynamicDropdown
                trigger={
                  <div className="flex cursor-pointer items-center gap-2">
                    {t("assets.custodian")}{" "}
                    <ChevronRight className="hidden rotate-90 md:inline" />
                  </div>
                }
                model={{
                  name: "teamMember",
                  queryKey: "name",
                  deletedAt: null,
                }}
                renderItem={(item) => resolveTeamMemberName(item, true)}
                label={t("list.filterByCustodian")}
                placeholder={t("list.searchTeamMembers")}
                initialDataKey="teamMembers"
                countKey="totalTeamMembers"
                withoutValueItem={{
                  id: "without-custody",
                  name: t("list.withoutCustody"),
                }}
              />
            </When>
          </div>
        </div>
      </Filters>
    );
  }

  if (modeIsAdvanced) {
    return <AdvancedAssetIndexFilters />;
  }
}

function AdvancedAssetIndexFilters() {
  return (
    <Filters
      slots={{
        "left-of-search": <AdvancedFilteringAndSorting />,
        "right-of-search": (
          <div className="flex items-center gap-2">
            <AvailabilityViewToggle modeIsSimple={false} />
          </div>
        ),
      }}
      searchClassName="leading-5"
    >
      <div className="flex w-full items-center justify-around gap-2 md:w-auto md:justify-end">
        <SavedFilterPresetsControls />
        <ConfigureColumnsDropdown />
      </div>
    </Filters>
  );
}
