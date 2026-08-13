/** In this file you can find the different ways of fetching data for the asset index. They are either for the simple or advanced mode */

import type { AssetIndexSettings } from "@prisma/client";
import type { OrganizationRoles } from "@prisma/client";
import { data, redirect } from "react-router";
import type { HeaderData } from "~/components/layout/header/types";
import { hasGetAllValue } from "~/hooks/use-model-filters";
import type { AllowedModelNames } from "~/routes/api+/model-filters";
import { getClientHint } from "~/utils/client-hints";
import {
  getAdvancedFiltersFromRequest,
  getFiltersFromRequest,
  setCookie,
  userPrefs,
} from "~/utils/cookies.server";
import { ShelfError } from "~/utils/error";
import { computeHasActiveFilters } from "~/utils/filter-params";
import { payload, getCurrentSearchParams } from "~/utils/http.server";
import { getParamsValues } from "~/utils/list";
import { Logger } from "~/utils/logger";
import { parseMarkdownToReact } from "~/utils/md";
import { isPersonalOrg } from "~/utils/organization";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { hasPermission } from "~/utils/permissions/permission.validator.server";
import { rolesAreScopedToOwnRecords } from "~/utils/permissions/role-scope";
import { canImportAssets } from "~/utils/subscription.server";
import { resolveUserDisplayName } from "~/utils/user";
import { parseFiltersWithHierarchy } from "./query.server";
import {
  getAdvancedPaginatedAndFilterableAssets,
  getEntitiesWithSelectedValues,
  getPaginatedAndFilterableAssets,
  refreshExpiredAssetImages,
} from "./service.server";
import { getAllSelectedValuesFromFilters } from "./utils.server";
import { MAX_SAVED_FILTER_PRESETS } from "../asset-filter-presets/constants";
import { listPresetsForUser } from "../asset-filter-presets/service.server";
import type { Column } from "../asset-index-settings/helpers";
import { getActiveCustomFields } from "../custom-field/service.server";
import type { OrganizationFromUser } from "../organization/service.server";
import {
  getTeamMemberForCustodianFilter,
  getTeamMemberForForm,
  getTeamMembersForNotify,
} from "../team-member/service.server";
import { getOrganizationTierLimit } from "../tier/service.server";

interface Props {
  request: Request;
  userId: string;
  organizationId: string;
  organizations: OrganizationFromUser[];
  role: OrganizationRoles;
  currentOrganization: OrganizationFromUser;
  user: { firstName: string | null };
  settings: AssetIndexSettings;
}

const searchFieldTooltipText = `
Search assets based on asset fields. Separate your keywords by a comma(,) to search with OR condition. Supported fields are: 
- Asset ID
- Name
- Description
- Category
- Location
- Tags
- Custodian names (first or last name)
- QR code value
- Custom field values
- Barcodes values
`;

export async function simpleModeLoader({
  request,
  userId,
  organizationId,
  organizations,
  role,
  currentOrganization,
  user,
  settings,
}: Props) {
  const { locale, timeZone } = getClientHint(request);
  /**
   * NOTE: We are now explicitly widening this to all scoped roles based on user request.
   * BASE users should also only see bookable assets in the global list. They can still
   * view their non-bookable assets in the "My Assets" page.
   */
  const isScopedToOwnRecords = rolesAreScopedToOwnRecords(role);
  const isSelfService = isScopedToOwnRecords;

  // Check if URL contains advanced filter syntax (from browser back button or old bookmark)
  // URLSearchParams.toString() encodes colons as %3A, so we must check the decoded values
  const urlSearchParams = getCurrentSearchParams(request);
  let hasAdvancedSyntax = false;

  for (const value of urlSearchParams.values()) {
    if (/(is|contains|gt|lt|gte|lte|eq|ne|startsWith|endsWith):/.test(value)) {
      hasAdvancedSyntax = true;
      break;
    }
  }

  if (hasAdvancedSyntax) {
    // URL has advanced syntax but we're in simple mode - redirect to clean URL
    // This handles browser back button after mode switch
    return redirect("/assets");
  }

  /** Parse filters */
  const {
    filters,
    serializedCookie: filtersCookie,
    redirectNeeded,
  } = await getFiltersFromRequest(request, organizationId, {
    name: "assetFilter_v2",
    path: "/", // Use root path so cookie is sent with RR7 single fetch .data requests
  });

  if (filters && redirectNeeded) {
    const cookieParams = new URLSearchParams(filters);
    return redirect(`/assets?${cookieParams.toString()}`);
  }

  const searchParams = getCurrentSearchParams(request);
  const hasActiveFilters = computeHasActiveFilters(searchParams);

  /** Query tierLimit, assets, presets, permissions & more — all in parallel */
  let [
    tierLimit,
    {
      search,
      totalAssets,
      perPage,
      page,
      categories,
      assets,
      totalPages,
      cookie,
      totalCategories,
      locations,
      totalLocations,
      teamMembers,
      totalTeamMembers,
    },
    teamMembersForFormData,
    notifyData,
    savedFilterPresets,
    canImport,
  ] = await Promise.all([
    getOrganizationTierLimit({
      organizationId,
      organizations,
    }),
    getPaginatedAndFilterableAssets({
      request,
      organizationId,
      filters,
      /**
       * Employees only ever see released inventory. Roles with org-wide
       * visibility (المستودعات / المالية / المخزون / admins) keep seeing
       * PENDING rows — the intake queue is their work list.
       */
      onlyReadyAssets: isScopedToOwnRecords,
      isSelfService,
      userId,
    }),
    // Team members for booking form - BASE/SELF_SERVICE always get their team member
    isScopedToOwnRecords
      ? getTeamMemberForForm({
          organizationId,
          userId,
          isScopedToOwnRecords,
          getAll:
            searchParams.has("getAll") &&
            hasGetAllValue(searchParams, "teamMember"),
        })
      : Promise.resolve(null),
    getTeamMembersForNotify({ organizationId }),
    // Saved filter presets — only depends on organizationId + userId
    listPresetsForUser({
      organizationId,
      ownerId: userId,
    }),
    // Import permission — only depends on organizationId, userId, role
    hasPermission({
      organizationId,
      userId,
      roles: role ? [role] : [],
      entity: PermissionEntity.asset,
      action: PermissionAction.import,
    }),
  ]);

  const currentUserTeamMember = isSelfService
    ? teamMembers.find((tm) => tm.userId === userId) ?? null
    : null;

  // Refresh expired signed URLs before returning so users never see broken images.
  // Runs after the main query completes but is awaited to ensure fresh URLs.
  // With 72h expiration, this path is hit infrequently.
  try {
    assets = await refreshExpiredAssetImages(assets);
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Failed to batch refresh expired asset images",
        label: "Assets",
        additionalData: { assetCount: assets.length },
        shouldBeCaptured: true,
      }),
    );
  }

  const userName = resolveUserDisplayName(user);
  const header: HeaderData = {
    title: isPersonalOrg(currentOrganization)
      ? userName
        ? `${userName}'s inventory`
        : `Your inventory`
      : currentOrganization?.name
      ? `${currentOrganization?.name}'s inventory`
      : "Your inventory",
  };

  const modelName = {
    singular: "asset",
    plural: "assets",
  };

  const userPrefsCookie = await userPrefs.serialize(cookie);
  const headers = [
    setCookie(userPrefsCookie),
    ...(filtersCookie ? [setCookie(filtersCookie)] : []),
  ];

  return data(
    payload({
      header,
      items: assets,
      categories,
      search,
      page,
      totalItems: totalAssets,
      perPage,
      totalPages,
      modelName,
      hasActiveFilters,
      canImportAssets: canImportAssets(tierLimit) && canImport,
      searchFieldLabel: "Search assets",
      searchFieldTooltip: {
        title: "Search your asset database",
        text: parseMarkdownToReact(searchFieldTooltipText),
      },
      totalCategories,
      locations,
      totalLocations,
      teamMembers,
      totalTeamMembers,
      currentUserTeamMember,
      teamMembersForForm: teamMembersForFormData?.teamMembers ?? teamMembers,
      ...notifyData,
      filters,
      organizationId,
      locale,
      timeZone,
      currentOrganization,
      settings,
      /**
       * We return an empty array in simple mode for easier to manage types
       * Those are fields we need in advanced mode and this helps us prevent type issues.
       * */
      customFields: [],
      // Saved filter presets
      savedFilterPresets,
      savedFilterPresetLimit: MAX_SAVED_FILTER_PRESETS,
    }),
    {
      headers,
    },
  );
}

export async function advancedModeLoader({
  request,
  userId,
  organizationId,
  organizations,
  role,
  currentOrganization,
  user,
  settings,
}: Props) {
  const { locale, timeZone } = getClientHint(request);
  /**
   * NOTE: Widened to all scoped roles based on user request.
   * BASE users should also only see bookable assets in the global list. They can still
   * view their non-bookable assets in the "My Assets" page.
   */
  const isScopedToOwnRecords = rolesAreScopedToOwnRecords(role);
  const isSelfService = isScopedToOwnRecords;

  /** Parse filters */
  const {
    filters,
    serializedCookie: filtersCookie,
    redirectNeeded,
  } = await getAdvancedFiltersFromRequest(request, organizationId, settings);

  const currentFilterParams = new URLSearchParams(filters || "");
  const searchParams = filters
    ? currentFilterParams
    : getCurrentSearchParams(request);
  const hasActiveFilters = computeHasActiveFilters(searchParams);
  const allSelectedEntries = searchParams.getAll(
    "getAll",
  ) as AllowedModelNames[];

  const paramsValues = getParamsValues(searchParams);
  const { teamMemberIds } = paramsValues;

  if (redirectNeeded) {
    const cookieParams = new URLSearchParams(filters);
    return redirect(`/assets?${cookieParams.toString()}`, {
      headers: filtersCookie ? [setCookie(filtersCookie)] : undefined,
    });
  }

  // Parse and expand location hierarchy filters ONCE — this avoids redundant
  // DB calls that were previously happening in both getAllSelectedValuesFromFilters
  // and getAdvancedPaginatedAndFilterableAssets independently.
  const parsedFilters = await parseFiltersWithHierarchy(
    filters ?? "",
    settings.columns as Column[],
    organizationId,
  );

  const { selectedCategory, selectedLocation, selectedAssetModel } =
    await getAllSelectedValuesFromFilters(
      filters,
      settings.columns as Column[],
      organizationId,
      parsedFilters,
    );

  // getEntitiesWithSelectedValues fetches filter dropdown options (tags,
  // categories, locations, asset models). Its output is only used in the final
  // response payload — no other query depends on it. Running it inside
  // Promise.all lets it overlap with the asset query instead of blocking it.
  /** Query entities, tierLimit, assets & more — all in parallel */
  const [
    {
      categories,
      totalCategories,
      locations,
      totalLocations,
      assetModels,
      totalAssetModels,
    },
    tierLimit,
    { search, totalAssets, perPage, page, assets, totalPages, cookie },
    customFields,
    teamMembersData,
    teamMembersForFormData,
    advNotifyData,
    advSavedFilterPresets,
    advCanImport,
  ] = await Promise.all([
    getEntitiesWithSelectedValues({
      organizationId,
      allSelectedEntries,
      selectedCategoryIds: selectedCategory,
      selectedLocationIds: selectedLocation,
      selectedAssetModelIds: selectedAssetModel,
    }),
    getOrganizationTierLimit({
      organizationId,
      organizations,
    }),
    getAdvancedPaginatedAndFilterableAssets({
      request,
      organizationId,
      filters,
      settings,
      canUseBarcodes: currentOrganization.barcodesEnabled ?? false,
      /** @see the simple-mode loader above for why this is scoped this way */
      onlyReadyAssets: isScopedToOwnRecords,
      preParsedFilters: parsedFilters,
    }),
    // We need the custom fields so we can create the options for filtering
    getActiveCustomFields({
      organizationId,
      includeAllCategories: true,
    }),

    // team members/custodian for filters
    getTeamMemberForCustodianFilter({
      organizationId,
      selectedTeamMembers: teamMemberIds,
      getAll:
        searchParams.has("getAll") &&
        hasGetAllValue(searchParams, "teamMember"),
      userId,
    }),

    // Team members for booking form - BASE/SELF_SERVICE always get their team member
    isScopedToOwnRecords
      ? getTeamMemberForForm({
          organizationId,
          userId,
          isScopedToOwnRecords,
          getAll:
            searchParams.has("getAll") &&
            hasGetAllValue(searchParams, "teamMember"),
        })
      : Promise.resolve(null),

    getTeamMembersForNotify({ organizationId }),
    // Saved filter presets — only depends on organizationId + userId
    listPresetsForUser({
      organizationId,
      ownerId: userId,
    }),
    // Import permission — only depends on organizationId, userId, role
    hasPermission({
      organizationId,
      userId,
      roles: role ? [role] : [],
      entity: PermissionEntity.asset,
      action: PermissionAction.import,
    }),
  ]);

  const currentUserTeamMember = isSelfService
    ? teamMembersData.teamMembers.find((tm) => tm.userId === userId) ?? null
    : null;

  // Refresh expired signed URLs before returning so users never see broken images.
  // With 72h expiration, this path is hit infrequently.
  let refreshedAssets = assets;
  try {
    refreshedAssets = await refreshExpiredAssetImages(assets);
  } catch (cause) {
    Logger.error(
      new ShelfError({
        cause,
        message: "Failed to batch refresh expired asset images",
        label: "Assets",
        additionalData: { assetCount: refreshedAssets.length },
        shouldBeCaptured: true,
      }),
    );
  }

  const userName = resolveUserDisplayName(user);
  const header: HeaderData = {
    title: isPersonalOrg(currentOrganization)
      ? userName
        ? `${userName}'s inventory`
        : `Your inventory`
      : currentOrganization?.name
      ? `${currentOrganization?.name}'s inventory`
      : "Your inventory",
  };

  const modelName = {
    singular: "asset",
    plural: "assets",
  };

  const userPrefsCookie = await userPrefs.serialize(cookie);
  const headers = [
    setCookie(userPrefsCookie),
    ...(filtersCookie ? [setCookie(filtersCookie)] : []),
  ];

  return data(
    payload({
      header,
      items: refreshedAssets,
      search,
      page,
      totalItems: totalAssets,
      perPage,
      totalPages,
      modelName,
      hasActiveFilters,
      canImportAssets: canImportAssets(tierLimit) && advCanImport,
      searchFieldLabel: "Search assets",
      searchFieldTooltip: {
        title: "Search your asset database",
        text: parseMarkdownToReact(searchFieldTooltipText),
      },
      filters,
      organizationId,
      locale,
      timeZone,
      currentOrganization,
      settings,

      customFields,
      ...teamMembersData,
      currentUserTeamMember,
      teamMembersForForm:
        teamMembersForFormData?.teamMembers ?? teamMembersData.teamMembers,
      ...advNotifyData,
      categories,
      totalCategories,
      locations,
      totalLocations,
      assetModels,
      totalAssetModels,
      // Saved filter presets
      savedFilterPresets: advSavedFilterPresets,
      savedFilterPresetLimit: MAX_SAVED_FILTER_PRESETS,
    }),
    {
      headers,
    },
  );
}
