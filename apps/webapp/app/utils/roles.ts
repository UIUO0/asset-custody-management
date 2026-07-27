import { OrganizationRoles } from "@prisma/client";

/**
 * Ordering used purely to detect demotions.
 *
 * A rank drop triggers `transferEntitiesToNewOwner` — every asset, booking and
 * kit the user owns is reassigned. So the ranks encode **breadth of data
 * visibility**, not seniority: a role change that keeps organization-wide
 * visibility must not move ownership around.
 *
 * That is why the three EPDA operational roles sit at rank 2 alongside ADMIN.
 * WAREHOUSE, FINANCE and INVENTORY all see the whole organization, so
 * ADMIN → WAREHOUSE is a lateral move, not a demotion. Only a drop to
 * BASE/SELF_SERVICE — where the user can suddenly see just their own records —
 * warrants transferring what they owned.
 *
 * This map is `Record<OrganizationRoles, number>` on purpose: it is exhaustive,
 * so adding a role to the enum without ranking it fails the type check instead
 * of silently producing `undefined > undefined === false` (never a demotion).
 *
 * @see {@link file://./permissions/role-scope.ts} — the visibility allow-list
 *   these ranks are meant to mirror
 */
const ROLE_RANK: Record<OrganizationRoles, number> = {
  [OrganizationRoles.OWNER]: 3,
  [OrganizationRoles.ADMIN]: 2,
  [OrganizationRoles.WAREHOUSE]: 2,
  [OrganizationRoles.FINANCE]: 2,
  [OrganizationRoles.INVENTORY]: 2,
  [OrganizationRoles.SELF_SERVICE]: 1,
  [OrganizationRoles.BASE]: 1,
};

/**
 * Determines whether changing from `current` to `next` is a demotion.
 * A demotion means the new role has a lower rank than the current role.
 */
export function isDemotion(
  current: OrganizationRoles,
  next: OrganizationRoles,
): boolean {
  return ROLE_RANK[current] > ROLE_RANK[next];
}

/**
 * Canonical English role names.
 *
 * These are **data**, not display strings: they are written into invite emails,
 * the user CSV export, and `parseUserRole`'s reverse lookup in
 * `modules/user/utils.server.ts`. Translating them would break that round trip,
 * so anything user-facing must go through {@link ORGANIZATION_ROLE_LABEL_KEYS}
 * instead.
 */
export type UserFriendlyRoles =
  | "Administrator"
  | "Owner"
  | "Base"
  | "Self service"
  | "Warehouse"
  | "Finance"
  | "Inventory";

/**
 * Single source of truth for role → canonical English name.
 *
 * Previously duplicated in three places (`settings.team.tsx`,
 * `invite-user-dialog.tsx`, `change-role-dialog.tsx`), each listing a different
 * subset — which is why adding a role meant it silently failed to appear in the
 * invite dropdown while showing up elsewhere.
 */
export const organizationRolesMap: Record<string, UserFriendlyRoles> = {
  [OrganizationRoles.ADMIN]: "Administrator",
  [OrganizationRoles.OWNER]: "Owner",
  [OrganizationRoles.BASE]: "Base",
  [OrganizationRoles.SELF_SERVICE]: "Self service",
  [OrganizationRoles.WAREHOUSE]: "Warehouse",
  [OrganizationRoles.FINANCE]: "Finance",
  [OrganizationRoles.INVENTORY]: "Inventory",
};

/**
 * Role → i18n key for the label shown in the UI.
 *
 * Exhaustive `Record<OrganizationRoles, string>`, so a role added to the enum
 * without a label fails the type check rather than rendering a raw enum value.
 *
 * Every key must exist in BOTH `app/i18n/locales/ar.json` and `en.json`.
 */
export const ORGANIZATION_ROLE_LABEL_KEYS: Record<OrganizationRoles, string> = {
  [OrganizationRoles.OWNER]: "team.roles.owner",
  [OrganizationRoles.ADMIN]: "team.roles.admin",
  [OrganizationRoles.BASE]: "team.roles.base",
  [OrganizationRoles.SELF_SERVICE]: "team.roles.selfService",
  [OrganizationRoles.WAREHOUSE]: "team.roles.warehouse",
  [OrganizationRoles.FINANCE]: "team.roles.finance",
  [OrganizationRoles.INVENTORY]: "team.roles.inventory",
};

/** Role → i18n key for the one-line description under the label. */
export const ORGANIZATION_ROLE_DESCRIPTION_KEYS: Record<
  OrganizationRoles,
  string
> = {
  [OrganizationRoles.OWNER]: "team.roleDescriptions.owner",
  [OrganizationRoles.ADMIN]: "team.roleDescriptions.admin",
  [OrganizationRoles.BASE]: "team.roleDescriptions.base",
  [OrganizationRoles.SELF_SERVICE]: "team.roleDescriptions.selfService",
  [OrganizationRoles.WAREHOUSE]: "team.roleDescriptions.warehouse",
  [OrganizationRoles.FINANCE]: "team.roleDescriptions.finance",
  [OrganizationRoles.INVENTORY]: "team.roleDescriptions.inventory",
};

/**
 * Roles that may be handed out through the invite and change-role dialogs.
 *
 * OWNER is excluded: ownership moves through the dedicated transfer flow, never
 * by picking it from a dropdown.
 *
 * Ordered as the dropdowns should render them — operational roles first, since
 * those are what EPDA assigns day to day.
 */
export const ASSIGNABLE_ORGANIZATION_ROLES: [
  OrganizationRoles,
  ...OrganizationRoles[],
] = [
  OrganizationRoles.ADMIN,
  OrganizationRoles.WAREHOUSE,
  OrganizationRoles.FINANCE,
  OrganizationRoles.INVENTORY,
  OrganizationRoles.BASE,
  OrganizationRoles.SELF_SERVICE,
];
