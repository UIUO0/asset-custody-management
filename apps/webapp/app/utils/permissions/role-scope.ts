/**
 * Role Data-Scope Helpers
 *
 * Answers a question that `userHasPermission({ entity, action })` deliberately
 * cannot: **which rows** may this user see?
 *
 * Permission checks answer "may this user perform action X on entity Y?".
 * Data scoping answers "is this user limited to records they are the custodian
 * of?". A WAREHOUSE user has `read` on bookings *and* must see every booking in
 * the organization; a SELF_SERVICE user has `read` on bookings but must only see
 * their own. Both facts are true simultaneously, so the two checks are separate.
 *
 * ## Why an allow-list
 *
 * The pre-EPDA codebase derived this negatively:
 *
 * ```ts
 * const isSelfServiceOrBase = role === SELF_SERVICE || role === BASE;
 * // ...anything that is NOT one of those two was treated as an administrator
 * ```
 *
 * That is a deny-list. Every organization role added later silently defaults to
 * *organization-wide visibility* — a data-exposure bug that fails open. Flipping
 * it to an allow-list means a role someone forgets to register here falls back to
 * the narrowest scope instead of the widest: it fails closed.
 *
 * @see {@link file://./permission.data.ts} — the entity/action permission map
 * @see {@link file://./../roles.server.ts} — `requirePermission`, the main caller
 * @see {@link file://./../../../../docs/epda-workflow-and-roles.md}
 */

import { OrganizationRoles } from "@prisma/client";

/**
 * Roles allowed to see every record in their organization.
 *
 * Any role NOT listed here is scoped to records where they are the custodian /
 * assignee. This is intentionally an allow-list — see the module docblock.
 *
 * Membership is a *data visibility* decision, independent of what the role may
 * write. FINANCE is read-heavy but must see the whole asset register to produce
 * financial analytics, so it belongs here even though it edits little.
 */
export const ROLES_WITH_ORG_WIDE_VISIBILITY: readonly OrganizationRoles[] = [
  OrganizationRoles.OWNER,
  OrganizationRoles.ADMIN,
  OrganizationRoles.WAREHOUSE,
  OrganizationRoles.FINANCE,
  OrganizationRoles.INVENTORY,
] as const;

/**
 * Roles that behave as workspace administrators for legacy branches that used to
 * read `!isSelfServiceOrBase` to mean "is an admin".
 *
 * Narrower than {@link ROLES_WITH_ORG_WIDE_VISIBILITY}: WAREHOUSE and INVENTORY
 * can *see* everything without being able to administer the workspace, so they
 * are absent here on purpose.
 */
export const ROLES_WITH_WORKSPACE_ADMIN: readonly OrganizationRoles[] = [
  OrganizationRoles.OWNER,
  OrganizationRoles.ADMIN,
] as const;

/**
 * True when the user must only ever be shown records they are attached to
 * (their own bookings, their own custody, audits assigned to them).
 *
 * Replaces the old `isSelfServiceOrBase` / `isBaseOrSelfService` flags. The value
 * is identical for the four upstream roles, so existing call sites keep their
 * behaviour; the difference is that unknown/new roles now resolve to `true`.
 *
 * @param roles - The user's roles in the current organization. `undefined` or an
 *   empty list resolves to `true` (most restrictive) rather than throwing, so a
 *   missing membership can never widen visibility.
 * @returns `true` when queries must be filtered down to the user's own records
 */
export function rolesAreScopedToOwnRecords(
  roles: OrganizationRoles | OrganizationRoles[] | undefined | null,
): boolean {
  if (!roles) return true;

  const roleList = Array.isArray(roles) ? roles : [roles];
  if (roleList.length === 0) return true;

  // A user holding several roles gets the widest scope any single role grants.
  return !roleList.some((role) =>
    ROLES_WITH_ORG_WIDE_VISIBILITY.includes(role),
  );
}

/**
 * True for roles that act on behalf of the whole organization but are **not**
 * the workspace owner — ADMIN plus the three EPDA operational roles.
 *
 * Exists for the handful of policies that deliberately exempt OWNER while still
 * applying to every other organization-wide role. The clearest example is the
 * "require explicit check-in for administrators" booking setting: an owner can
 * always quick-check-in, an admin cannot when the setting is on, and WAREHOUSE
 * must follow the admin rule rather than slipping through unchecked.
 *
 * Before this existed those sites read `role === OrganizationRoles.ADMIN`, so a
 * new role escaped the restriction entirely — the same fail-open shape as the
 * old `isSelfServiceOrBase`, just inverted.
 *
 * @param roles - The user's roles in the current organization
 * @returns `true` for organization-wide roles other than OWNER
 */
export function hasOrgWideNonOwnerRole(
  roles: OrganizationRoles | OrganizationRoles[] | undefined | null,
): boolean {
  if (!roles) return false;

  const roleList = Array.isArray(roles) ? roles : [roles];
  if (roleList.includes(OrganizationRoles.OWNER)) return false;

  return !rolesAreScopedToOwnRecords(roleList);
}

/**
 * True when the user may administer the workspace (settings, team, subscription).
 *
 * Use this only where the old code meant "is an admin", not where it meant
 * "sees everything" — for the latter use {@link rolesAreScopedToOwnRecords}.
 *
 * @param roles - The user's roles in the current organization
 * @returns `true` for OWNER/ADMIN only
 */
export function hasWorkspaceAdminRole(
  roles: OrganizationRoles | OrganizationRoles[] | undefined | null,
): boolean {
  if (!roles) return false;

  const roleList = Array.isArray(roles) ? roles : [roles];

  return roleList.some((role) => ROLES_WITH_WORKSPACE_ADMIN.includes(role));
}

/**
 * The department desk this user speaks for, or `null`.
 *
 * **Both** halves are required: the pointer says where somebody works, the role
 * is what grants them the desk's authority. An employee who merely belongs to a
 * department must not inherit its stock.
 *
 * Deliberately independent of {@link rolesAreScopedToOwnRecords}. "Which rows
 * may I see?" and "which desk do I act for?" are different questions, and
 * conflating them hid the IT desk from `admin@epda.local`: they hold `OWNER`
 * (org-wide, so nothing is filtered) *and* speak for تقنية المعلومات, and a
 * visibility-derived answer returned "no desk" for exactly that combination.
 *
 * @param roles - The user's roles in the current organization
 * @param departmentTeamMemberId - The desk recorded on their membership
 * @returns The desk's team-member id, or `null`
 */
export function resolveDepartmentDeskId({
  roles,
  departmentTeamMemberId,
}: {
  roles: OrganizationRoles | OrganizationRoles[] | undefined | null;
  departmentTeamMemberId?: string | null;
}): string | null {
  if (!departmentTeamMemberId) return null;

  const roleList = roles ? (Array.isArray(roles) ? roles : [roles]) : [];

  return roleList.includes(OrganizationRoles.DEPARTMENT)
    ? departmentTeamMemberId
    : null;
}

/**
 * The team-member rows whose custody this user is allowed to see.
 *
 * A third scope, between "everything" and "my own records". `DEPARTMENT` is
 * deliberately absent from {@link ROLES_WITH_ORG_WIDE_VISIBILITY}, so
 * {@link rolesAreScopedToOwnRecords} returns `true` for it — correct as a
 * fail-closed default, but on its own it would show a department user *nothing*:
 * batch stock is held by the department's own `TeamMember` row, which is not the
 * user's personal one.
 *
 * Returning ids (rather than a boolean) keeps the widening explicit and
 * auditable at the call site: a query filters `custodianId IN (...)`, and the
 * set is only ever as wide as the caller's membership makes it.
 *
 * @param roles - The user's roles in the current organization
 * @param ownTeamMemberId - The user's personal team-member row, if any
 * @param departmentTeamMemberId - The department they belong to, if any
 * @returns Team-member ids to filter custody by, or `null` for org-wide roles
 *   (meaning "do not filter"). An empty array means "show nothing" — never
 *   treat it as "show everything".
 */
export function visibleCustodianIds({
  roles,
  ownTeamMemberId,
  departmentTeamMemberId,
}: {
  roles: OrganizationRoles | OrganizationRoles[] | undefined | null;
  ownTeamMemberId: string | null | undefined;
  departmentTeamMemberId?: string | null;
}): string[] | null {
  if (!rolesAreScopedToOwnRecords(roles)) return null;

  const ids = new Set<string>();

  if (ownTeamMemberId) ids.add(ownTeamMemberId);

  // One rule, one place — see `resolveDepartmentDeskId`.
  const deskId = resolveDepartmentDeskId({ roles, departmentTeamMemberId });
  if (deskId) ids.add(deskId);

  return [...ids];
}
