import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  AlarmClockIcon,
  BellIcon,
  BoxesIcon,
  CalendarRangeIcon,
  ChartLineIcon,
  ClipboardCheckIcon,
  FileBarChartIcon,
  HomeIcon,
  MapPinIcon,
  MessageCircleIcon,
  Package,
  PackageOpenIcon,
  ScanBarcodeIcon,
  SettingsIcon,
  TagsIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { UpgradeMessage } from "~/components/marketing/upgrade-message";
import When from "~/components/when/when";
import type { loader } from "~/routes/_layout+/_layout";
import { isPersonalOrg } from "~/utils/organization";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator.client";
import { useCurrentOrganization } from "./use-current-organization";
import { useUserRoleHelper } from "./user-user-role-helper";

type BaseNavItem = {
  title: string;
  hidden?: boolean;
  Icon: LucideIcon;
  disabled?: boolean | { reason: ReactNode };
  badge?: {
    show: boolean;
    variant?: "unread";
  };
};

export type ChildNavItem = BaseNavItem & {
  type: "child";
  to: string;
  target?: string;
};

export type ParentNavItem = BaseNavItem & {
  type: "parent";
  children: Omit<ChildNavItem, "type" | "Icon">[];
};

type LabelNavItem = Omit<BaseNavItem, "Icon"> & {
  type: "label";
};

type ButtonNavItem = BaseNavItem & {
  type: "button";
  onClick: () => void;
};

export type NavItem =
  | ChildNavItem
  | ParentNavItem
  | LabelNavItem
  | ButtonNavItem;

export function useSidebarNavItems() {
  const { t } = useTranslation();
  const { isAdmin, canUseBookings, subscription, unreadUpdatesCount } =
    useLoaderData<typeof loader>();
  const { roles, isScopedToOwnRecords } = useUserRoleHelper();
  const currentOrganization = useCurrentOrganization();
  const isPersonalOrganization = isPersonalOrg(currentOrganization);

  /**
   * Nav visibility is derived per-entity rather than from "is this an admin?".
   *
   * Every entry below used to read `hidden: isBaseOrSelfService`, which meant
   * any role added later saw the whole sidebar — including sections it has no
   * permission for, so the links 403'd on click. Asking the permission map the
   * same question the loader will ask keeps the two in step.
   */
  const can = (entity: PermissionEntity, action: PermissionAction) =>
    userHasPermission({ roles, entity, action });

  const canReadDashboard = can(
    PermissionEntity.dashboard,
    PermissionAction.read,
  );
  const canReadTeam = can(PermissionEntity.teamMember, PermissionAction.read);
  const canReadGeneralSettings = can(
    PermissionEntity.generalSettings,
    PermissionAction.read,
  );
  const canReadCustomFields = can(
    PermissionEntity.customField,
    PermissionAction.read,
  );
  // why: BASE already holds `assetModel.read` for the asset form, but has never
  // had a workspace-settings entry. The scope check preserves that.
  const canReadAssetModels =
    !isScopedToOwnRecords &&
    can(PermissionEntity.assetModel, PermissionAction.read);

  const canSeeWorkspaceSettings =
    canReadGeneralSettings || canReadCustomFields || canReadAssetModels;

  const bookingDisabled = useMemo(() => {
    if (canUseBookings) {
      return false;
    }

    return {
      reason: (
        <div>
          <h5>Disabled</h5>
          <p>
            Booking is a premium feature only available for Team workspaces.
          </p>

          <When truthy={!!subscription} fallback={<UpgradeMessage />}>
            <p>Please switch to your team workspace to access this feature.</p>
          </When>
        </div>
      ),
    };
  }, [canUseBookings, subscription]);

  const topMenuItems: NavItem[] = [
    {
      type: "child",
      title: t("nav.adminDashboard"),
      to: "/admin-dashboard/users",
      Icon: ChartLineIcon,
      hidden: !isAdmin,
    },
    {
      type: "label",
      title: t("nav.assetManagement"),
    },
    {
      type: "child",
      title: t("nav.home"),
      to: "/home",
      Icon: HomeIcon,
      hidden: !canReadDashboard,
    },
    {
      type: "child",
      title: t("nav.assets"),
      to: "/assets",
      Icon: PackageOpenIcon,
    },
    {
      type: "child",
      title: t("nav.kits"),
      to: "/kits",
      Icon: Package,
    },
    {
      type: "child",
      title: t("nav.categories"),
      to: "/categories",
      Icon: BoxesIcon,
      hidden: !can(PermissionEntity.category, PermissionAction.read),
    },
    {
      type: "child",
      title: t("nav.tags"),
      to: "/tags",
      Icon: TagsIcon,
      hidden: !can(PermissionEntity.tag, PermissionAction.read),
    },
    {
      type: "child",
      title: t("nav.locations"),
      to: "/locations",
      Icon: MapPinIcon,
      hidden: !can(PermissionEntity.location, PermissionAction.read),
    },
    {
      type: "child",
      title: t("nav.audits"),
      to: "/audits",
      Icon: ClipboardCheckIcon,
    },
    {
      type: "parent",
      title: t("nav.bookings"),
      Icon: CalendarRangeIcon,
      disabled: bookingDisabled,
      children: [
        {
          title: t("nav.viewBookings"),
          to: "/bookings",
          disabled: bookingDisabled,
        },
        {
          title: t("nav.calendar"),
          to: "/calendar",
          disabled: bookingDisabled,
        },
      ],
    },
    {
      type: "child",
      title: t("nav.reminders"),
      Icon: AlarmClockIcon,
      hidden: !can(PermissionEntity.assetReminders, PermissionAction.read),
      to: "/reminders",
    },
    {
      type: "child",
      title: t("nav.reports"),
      Icon: FileBarChartIcon,
      hidden: !canReadDashboard,
      to: "/reports",
    },
    {
      type: "label",
      title: t("nav.organization"),
      hidden: !canReadTeam && !canSeeWorkspaceSettings,
    },
    {
      type: "parent",
      title: t("nav.team"),
      Icon: UsersRoundIcon,
      hidden: !canReadTeam,
      children: [
        {
          title: t("nav.users"),
          to: "/settings/team/users",
          hidden: isPersonalOrganization,
        },
        {
          title: t("nav.pendingInvites"),
          to: "/settings/team/invites",
          hidden: isPersonalOrganization,
        },
        {
          title: t("nav.nonRegisteredMembers"),
          to: "/settings/team/nrm",
        },
      ],
    },
    {
      type: "parent",
      title: t("nav.workspaceSettings"),
      Icon: SettingsIcon,
      hidden: !canSeeWorkspaceSettings,
      children: [
        {
          title: t("nav.general"),
          to: "/settings/general",
          hidden: !canReadGeneralSettings,
        },
        {
          title: t("nav.bookings"),
          to: "/settings/bookings",
          hidden: isPersonalOrganization || !canReadGeneralSettings,
        },
        {
          title: t("nav.customFields"),
          to: "/settings/custom-fields",
          hidden: !canReadCustomFields,
        },
        {
          title: t("nav.assetModels"),
          to: "/settings/asset-models",
          hidden: !canReadAssetModels,
        },
      ],
    },
  ];

  const bottomMenuItems: NavItem[] = [
    {
      type: "child",
      title: t("nav.qrScanner"),
      to: "/scanner",
      Icon: ScanBarcodeIcon,
    },
    {
      type: "button",
      title: t("nav.updates"),
      Icon: BellIcon,
      badge: {
        show: (unreadUpdatesCount || 0) > 0,
        variant: "unread" as const,
      },
      onClick: () => {
        // This will be handled by the sidebar component with popover
      },
    },
    {
      type: "button",
      title: t("nav.feedback"),
      Icon: MessageCircleIcon,
      onClick: () => {
        // Handled by FeedbackNavItem in sidebar-nav.tsx
      },
    },
  ];

  return {
    topMenuItems: removeHiddenNavItems(topMenuItems),
    bottomMenuItems: removeHiddenNavItems(bottomMenuItems),
  };
}

function removeHiddenNavItems(navItems: NavItem[]) {
  return navItems
    .filter((item) => !item.hidden)
    .map((item) => {
      if (item.type === "parent") {
        return {
          ...item,
          children: item.children.filter((child) => !child.hidden),
        };
      }

      return item;
    });
}
