import { OrganizationRoles } from "@prisma/client";

/**
 * Ordering used purely to detect demotions.
 *
 * A rank drop triggers `transferEntitiesToNewOwner` — every asset, booking and
 * kit the user owns is reassigned. So the ranks encode **breadth of data
 * visibility**, not seniority: a role change that keeps organization-wide
 * visibility must not move ownership around.
 *
 * That is why the three ORG operational roles sit at rank 2 alongside ADMIN.
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
  // Rank 1, not 2: a department sees the stock delivered to *its* department,
  // not the whole workspace. By the rule this map encodes — breadth of data
  // visibility — ADMIN → DEPARTMENT narrows what the user can see, so it is a
  // demotion and what they owned must be transferred.
  [OrganizationRoles.DEPARTMENT]: 1,
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
  | "Inventory"
  | "Department";

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
  [OrganizationRoles.DEPARTMENT]: "Department",
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
  [OrganizationRoles.DEPARTMENT]: "team.roles.department",
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
  [OrganizationRoles.DEPARTMENT]: "team.roleDescriptions.department",
};

/**
 * Roles that may be handed out through the invite and change-role dialogs.
 *
 * OWNER is excluded: ownership moves through the dedicated transfer flow, never
 * by picking it from a dropdown.
 *
 * Ordered as the dropdowns should render them — operational roles first, since
 * those are what ORG assigns day to day.
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

/**
 * The user's effective rank — the widest-seeing role they hold.
 *
 * A membership is an *array*, and `roles[0]` is whatever happened to be written
 * first. Reading rank off it makes every guard order-dependent: a membership
 * stored `[DEPARTMENT, ADMIN]` reads as a DEPARTMENT user, and the "only the
 * owner may change an administrator's role" check waves it through.
 *
 * @param roles - The user's roles in one organization
 * @returns The highest-ranked role held, or `BASE` for an empty membership —
 *   the narrowest answer, so a missing membership can never widen anything
 */
export function highestRole(
  roles: readonly OrganizationRoles[] | undefined | null,
): OrganizationRoles {
  if (!roles?.length) return OrganizationRoles.BASE;

  return roles.reduce((highest, role) =>
    ROLE_RANK[role] > ROLE_RANK[highest] ? role : highest,
  );
}

/**
 * Roles the change-role dialog has no vocabulary for, and so must not destroy.
 *
 * `DEPARTMENT` is not a rank — it is the marker that says "this account speaks
 * for a department desk", and it pairs with
 * `UserOrganization.departmentTeamMemberId`. The dialog cannot assign it
 * (it is absent from {@link ASSIGNABLE_ORGANIZATION_ROLES}), so a role change
 * that overwrote the whole array would strip it with **no way to put it back
 * short of editing the database** — and the desk's open handovers would become
 * unsignable, which is how a محضر ends up pending forever.
 *
 * Derived from {@link ASSIGNABLE_ORGANIZATION_ROLES} rather than listed, so a
 * future non-assignable role is preserved automatically instead of being
 * silently dropped by the first role change after it ships.
 *
 * @param roles - The membership's current roles
 * @returns Those the dialog did not put there and cannot restore
 */
export function preservedRoles(
  roles: readonly OrganizationRoles[] | undefined | null,
): OrganizationRoles[] {
  if (!roles?.length) return [];

  return roles.filter(
    (role) =>
      role !== OrganizationRoles.OWNER &&
      !ASSIGNABLE_ORGANIZATION_ROLES.includes(role),
  );
}
