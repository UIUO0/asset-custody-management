import type { ReactNode } from "react";
import {
  AlarmClockIcon,
  BellIcon,
  BoxesIcon,
  Building2Icon,
  ChartLineIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileTextIcon,
  FileBarChartIcon,
  HandIcon,
  HomeIcon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  PackageOpenIcon,
  ScanBarcodeIcon,
  SignatureIcon,
  UserRoundPlusIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import type { loader } from "~/routes/_layout+/_layout";
import { isPersonalOrg } from "~/utils/organization";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { useCurrentOrganization } from "./use-current-organization";
import { useUserRoleHelper } from "./user-user-role-helper";

type BaseNavItem = {
  title: string;
  hidden?: boolean;
  Icon: LucideIcon;
  disabled?: boolean | { reason: ReactNode };
  badge?: {
    show: boolean;
    /** Number rendered inside the pill. Omitted badges render nothing. */
    count?: number;
    variant?: "unread" | "action";
    /**
     * The full sentence, e.g. "لديك ٣ أصول لم تُرمَّز بعد".
     *
     * A bare pill says how many but never what of — fine for a queue whose
     * name is the nav item itself ("Handovers: 3"), useless for a count that
     * is *about* something inside the page. Rendered as the pill's tooltip and
     * as its accessible name, so the number is never the only thing said.
     */
    label?: string;
    /**
     * The same thing as a bare noun phrase — "أصول لم تُرمَّز بعد" — for the
     * expanded-sidebar notice, which renders the figure itself and would
     * otherwise print it twice.
     */
    noun?: string;
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
  const {
    isAdmin,
    unreadUpdatesCount,
    pendingHandoverCount,
    assetActionQueue,
  } = useLoaderData<typeof loader>();
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

  /**
   * The coding/approval relay badge, shown on both screens the relay runs
   * through — the asset index and purchase orders.
   *
   * One badge, not two: a viewer is on one side of the relay or the other, and
   * the loader has already decided which by zeroing the count they cannot act
   * on. Rendering the same object on both entries keeps them from drifting into
   * two different sentences for one number.
   *
   * `undefined` (not a hidden badge) when there is nothing waiting, so items
   * without work keep their exact markup.
   */
  const relayBadge = (() => {
    const { awaitingFinanceCode, awaitingApproval } = assetActionQueue;

    if (awaitingFinanceCode > 0) {
      return {
        show: true,
        count: awaitingFinanceCode,
        variant: "action" as const,
        label: t("nav.awaitingFinanceCode", { count: awaitingFinanceCode }),
        noun: t("nav.awaitingFinanceCodeItems", { count: awaitingFinanceCode }),
      };
    }

    if (awaitingApproval > 0) {
      return {
        show: true,
        count: awaitingApproval,
        variant: "action" as const,
        label: t("nav.awaitingApproval", { count: awaitingApproval }),
        noun: t("nav.awaitingApprovalItems", { count: awaitingApproval }),
      };
    }

    return undefined;
  })();

  const canReadDashboard = can(
    PermissionEntity.dashboard,
    PermissionAction.read,
  );
  /**
   * Intake is المستودعات' instrument, but المالية and المخزون read receipts for
   * their prices and their monitoring. Asking for `read` rather than naming
   * roles keeps the nav in step with the permission map.
   */
  const canReadReceipts = can(
    PermissionEntity.goodsReceipt,
    PermissionAction.read,
  );
  const canReadTeam = can(PermissionEntity.teamMember, PermissionAction.read);

  /**
   * Audits are the one operational surface an ordinary employee legitimately
   * reaches: the index is already scoped to their own assignments, so for them
   * `/audits` reads as "my audits".
   */
  const canReadAudits = can(PermissionEntity.audit, PermissionAction.read);
  const canReadReminders = can(
    PermissionEntity.assetReminders,
    PermissionAction.read,
  );

  /**
   * Sidebar grouping.
   *
   * The menu used to be one long list under a single "asset management" label,
   * which meant an ordinary employee scrolled past a dozen inventory tools to
   * reach the two pages that concern them. It is now split by *who the section
   * is for*, and each label carries the same visibility as its children so no
   * empty heading is ever left behind:
   *
   * - **خدماتي** — everyone. What I am holding, and what awaits my signature.
   * - **المخزون** — the catalogue itself. Browsing and editing inventory is an
   *   operational job, so this whole section is hidden from roles scoped to
   *   their own records: `/assets` is an inventory tool they cannot act in,
   *   and "الأصناف المتاحة" already answers the question they actually have.
   *   (The route stays reachable by link — a scanned QR or a row link still
   *   opens an asset.)
   * - **العمليات** — running the workflow: the requests queue, audits,
   *   reminders, reports.
   * - **المنظمة** — people and workspace configuration.
   */
  const showInventorySection = !isScopedToOwnRecords || canReadReceipts;
  const showOperationsSection =
    canReadAudits || canReadReminders || canReadDashboard;

  const topMenuItems: NavItem[] = [
    {
      type: "child",
      title: t("nav.adminDashboard"),
      to: "/admin-dashboard/users",
      Icon: ChartLineIcon,
      hidden: !isAdmin,
    },
    {
      type: "child",
      title: t("nav.home"),
      to: "/home",
      Icon: HomeIcon,
      hidden: !canReadDashboard,
    },

    { type: "label", title: t("nav.mySpace") },
    {
      /**
       * Holding custody is not a permission, it is a fact about a person: a
       * warehouse operator can be a custodian just as an employee can, and the
       * page only ever shows the viewer's own holdings.
       */
      type: "child",
      title: t("nav.myCustody"),
      to: "/my-custody",
      Icon: HandIcon,
    },
    {
      /**
       * Sits in خدماتي, not العمليات, and is shown to everyone: being named on
       * a handover is not a permission, it is something that happened to you.
       * An operator sees the same entry because they can be the employee on
       * someone else's record too.
       *
       * The badge counts only records waiting on *this* viewer's signature —
       * a number about somebody else's inbox is noise, and a badge that never
       * clears stops being read.
       */
      type: "child",
      title: t("nav.pendingHandovers"),
      to: "/handovers",
      Icon: SignatureIcon,
      badge: {
        show: pendingHandoverCount > 0,
        count: pendingHandoverCount,
        variant: "unread",
      },
    },

    { type: "label", title: t("nav.inventory"), hidden: !showInventorySection },
    {
      /**
       * Intake sits at the top of the inventory section because it is where
       * everything in that section comes from: stock now enters only through
       * مذكرة/محضر استلام.
       */
      type: "child",
      title: t("nav.receipts"),
      to: "/receipts",
      Icon: ClipboardListIcon,
      hidden: !canReadReceipts,
    },
    {
      /**
       * Sits next to receipts because it is the same data read the other way:
       * receipts are "what arrived on this document", orders are "what arrived
       * against this purchase". It is also المالية's queue — the only inventory
       * entry they act in — so it must be visible to a role that sees little
       * else in this section.
       */
      type: "child",
      title: t("nav.purchaseOrders"),
      to: "/purchase-orders",
      Icon: FileTextIcon,
      hidden: !canReadReceipts,
      badge: relayBadge,
    },
    {
      type: "child",
      title: t("nav.assets"),
      to: "/assets",
      Icon: PackageOpenIcon,
      hidden: !showInventorySection,
      badge: relayBadge,
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
      title: t("nav.categories"),
      to: "/categories",
      Icon: BoxesIcon,
      hidden: !can(PermissionEntity.category, PermissionAction.read),
    },
    {
      type: "label",
      title: t("nav.operations"),
      hidden: !showOperationsSection,
    },
    {
      type: "child",
      title: t("nav.audits"),
      to: "/audits",
      Icon: ClipboardCheckIcon,
      hidden: !canReadAudits,
    },
    {
      type: "child",
      title: t("nav.reminders"),
      Icon: AlarmClockIcon,
      hidden: !canReadReminders,
      to: "/reminders",
    },
    {
      type: "child",
      title: t("nav.reports"),
      Icon: FileBarChartIcon,
      hidden: !canReadDashboard,
      to: "/reports",
    },

    /**
     * الفريق is its own section now — «المنشأة» is gone.
     *
     * That heading grouped two items. The second, «إعدادات مساحة العمل», was
     * removed: its screens were the workspace name/logo/SSO, الحقول المخصّصة
     * and طُرز الأصناف, and the two taxonomies held zero rows and play no part
     * in the intake flow. What was left did not deserve a heading of its own
     * called "the organisation".
     *
     * ⚠️ Dropping the label alone was not enough: a `label` scopes everything
     * after it, so الفريق silently fell under «العمليات» for المستودعات and
     * under «خدماتي» for الإدارة — reading as an operation, and as a personal
     * service. A section needs its own label or it inherits the previous one.
     *
     * Flattened from a collapsible parent to plain children while here: three
     * links behind a disclosure triangle cost a click and hid الإدارات, which
     * is the one screen in the app that can create a department desk.
     */
    {
      type: "label",
      title: t("nav.team"),
      hidden: !canReadTeam,
    },
    {
      type: "child",
      title: t("nav.users"),
      Icon: UsersRoundIcon,
      hidden: !canReadTeam || isPersonalOrganization,
      to: "/settings/team/users",
    },
    {
      type: "child",
      title: t("team.departments"),
      Icon: Building2Icon,
      hidden: !canReadTeam || isPersonalOrganization,
      to: "/settings/team/departments",
    },
    {
      type: "child",
      title: t("nav.nonRegisteredMembers"),
      Icon: UserRoundPlusIcon,
      hidden: !canReadTeam,
      to: "/settings/team/nrm",
    },
    {
      type: "child",
      title: t("nav.pendingInvites"),
      Icon: MailIcon,
      hidden: !canReadTeam || isPersonalOrganization,
      to: "/settings/team/invites",
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
