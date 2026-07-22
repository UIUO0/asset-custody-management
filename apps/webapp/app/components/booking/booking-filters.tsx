import { BookingStatus } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import type { RouteHandleWithName } from "~/modules/types";
import type { OrganizationPermissionSettings } from "~/utils/permissions/custody-and-bookings-permissions.validator.client";
import { userHasCustodyViewPermission } from "~/utils/permissions/custody-and-bookings-permissions.validator.client";
import { resolveTeamMemberName } from "~/utils/user";
import { StatusFilter } from "./status-filter";
import DynamicDropdown from "../dynamic-dropdown/dynamic-dropdown";
import { Filters } from "../list/filters";
import { SortBy } from "../list/filters/sort-by";
import When from "../when/when";

type BookingFiltersProps = {
  className?: string;
  hideSortBy?: boolean;
};

export default function BookingFilters({
  className,
  hideSortBy = false,
}: BookingFiltersProps) {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();

  /** Sorting labels follow the active locale; keys stay the DB columns. */
  const sortingOptions = {
    from: t("bookings.sortFromDate"),
    to: t("bookings.sortToDate"),
    name: t("list.sortName"),
  };
  const organization = useCurrentOrganization();
  const matches = useMatches();

  const currentRoute: RouteHandleWithName = matches[matches.length - 1];

  const canSeeAllCustody = userHasCustodyViewPermission({
    roles,
    organization: organization as OrganizationPermissionSettings,
  });

  const shouldRenderCustodianFilter =
    canSeeAllCustody &&
    !["$userId.bookings", "me.bookings"].includes(
      // on the user bookings page we dont want to show the custodian filter becuase they are alreayd filtered for that user
      currentRoute?.handle?.name,
    );

  return (
    <Filters
      className={className}
      slots={{
        "left-of-search": <StatusFilter statusItems={BookingStatus} />,
        "right-of-search": hideSortBy ? null : (
          <SortBy
            sortingOptions={sortingOptions}
            defaultSortingBy="from"
            defaultSortingDirection="asc"
          />
        ),
      }}
    >
      <When truthy={shouldRenderCustodianFilter}>
        <DynamicDropdown
          trigger={
            <div className="my-2 flex cursor-pointer items-center gap-2 md:my-0">
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
        />
      </When>

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
    </Filters>
  );
}
