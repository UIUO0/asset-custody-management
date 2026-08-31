import type { SsoDetails } from "@prisma/client";
import { OrganizationRoles, Roles } from "@prisma/client";
import * as Sentry from "@sentry/react-router";
import { db } from "~/database/db.server";
import { getSelectedOrganization } from "~/modules/organization/context.server";
import { ShelfError } from "./error";
import type {
  PermissionAction,
  PermissionEntity,
} from "./permissions/permission.data";
import { userHasPermission } from "./permissions/permission.validator";
import { validatePermission } from "./permissions/permission.validator.server";
import { rolesAreScopedToOwnRecords } from "./permissions/role-scope";

export async function requireUserWithPermission(name: Roles, userId: string) {
  try {
    return await db.user.findFirstOrThrow({
      where: { id: userId, roles: { some: { name } } },
      select: { id: true },
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "You do not have permission to access this resource",
      additionalData: { userId, name },
      label: "Permission",
      status: 403,
      shouldBeCaptured: false,
    });
  }
}

export async function requireAdmin(userId: string) {
  return requireUserWithPermission(Roles["ADMIN"], userId);
}

export async function isAdmin(context: Record<string, any>) {
  const authSession = context.getSession();

  const user = await db.user.findFirst({
    where: {
      id: authSession.userId,
      roles: { some: { name: Roles["ADMIN"] } },
    },
    select: { id: true },
  });

  return !!user;
}

export async function requirePermission({
  userId,
  request,
  entity,
  action,
}: {
  userId: string;
  request: Request;
  entity: PermissionEntity;
  action: PermissionAction;
}) {
  const { organizationId, roles } = await resolveRequestRoles({
    userId,
    request,
  });

  await validatePermission({
    roles,
    action,
    entity,
    organizationId,
    userId,
  });

  return buildPermissionContext({ userId, request });
}

/**
 * Resolves the workspace and the roles the user holds in it.
 *
 * Split out so {@link requirePermission} and {@link requireAnyPermission} check
 * the *same* roles they later report — two copies of this lookup would be two
 * chances for the gate and the returned context to disagree.
 */
async function resolveRequestRoles({
  userId,
  request,
}: {
  userId: string;
  request: Request;
}) {
  /**
   * This can be very slow and consuming as there are a few queries with a few joins and this running on every loader/action makes it slow
   * We need to find a  strategy to make it more performant. Idea:
   * 1. Have a very light weight query that fetches the lastUpdated in relation to userOrganizationRoles. THis can be done both for roles and organizations
   * 2. Store it in a cookie
   * 3. If they mismatch, make the big query to check the actual data
   */
  const { organizationId, userOrganizations } = await getSelectedOrganization({
    userId,
    request,
  });

  return {
    organizationId,
    roles: userOrganizations.find((o) => o.organization.id === organizationId)
      ?.roles,
  };
}

/**
 * Everything a loader gets back once its gate has passed.
 *
 * Shared verbatim by both `require*Permission` helpers so the two can never
 * hand back differently-shaped context.
 */
async function buildPermissionContext({
  userId,
  request,
}: {
  userId: string;
  request: Request;
}) {
  const {
    organizationId,
    userOrganizations,
    organizations,
    currentOrganization,
  } = await getSelectedOrganization({ userId, request });

  const roles = userOrganizations.find(
    (o) => o.organization.id === organizationId,
  )?.roles;

  // Tag the current Sentry scope with the resolved user + organization so
  // every span / error emitted later in this request is filterable in
  // Sentry by `user.id` and `organizationId`. requirePermission runs in
  // every authenticated loader/action, so this is the natural choke point.
  Sentry.setUser({ id: userId });
  Sentry.setTag("organizationId", organizationId);

  const role = roles ? roles[0] : OrganizationRoles.BASE;

  /**
   * Whether every query in this request must be narrowed to records the user is
   * attached to. Derived from an explicit allow-list of organization-wide roles
   * (see `role-scope.ts`), so a role nobody registered there falls back to the
   * narrowest scope rather than seeing the whole organization.
   *
   * Passes the full `roles` array, not just `role`, so a user holding several
   * roles gets the widest scope any one of them grants.
   */
  const isScopedToOwnRecords = rolesAreScopedToOwnRecords(roles ?? [role]);

  /**
   * Organization settings can widen visibility for the two restricted upstream
   * roles. The overrides are keyed to SELF_SERVICE and BASE specifically — the
   * ORG operational roles are already organization-wide via the allow-list, so
   * the first clause covers them.
   */
  const canSeeAllBookings =
    // Roles with organization-wide visibility always see everything
    !isScopedToOwnRecords ||
    // SELF_SERVICE can see all if org setting allows
    (role === OrganizationRoles.SELF_SERVICE &&
      currentOrganization.selfServiceCanSeeBookings) ||
    // BASE can see all if org setting allows
    (role === OrganizationRoles.BASE &&
      currentOrganization.baseUserCanSeeBookings);

  // Determine if user can see all custody information
  const canSeeAllCustody =
    // Roles with organization-wide visibility always see everything
    !isScopedToOwnRecords ||
    // SELF_SERVICE can see all if org setting allows
    (role === OrganizationRoles.SELF_SERVICE &&
      currentOrganization.selfServiceCanSeeCustody) ||
    // BASE can see all if org setting allows
    (role === OrganizationRoles.BASE &&
      currentOrganization.baseUserCanSeeCustody);

  // Determine if user can use barcodes based on organization settings
  const canUseBarcodes = currentOrganization.barcodesEnabled ?? false;

  // Determine if user can use audits based on organization settings
  const canUseAudits = currentOrganization.auditsEnabled ?? false;

  return {
    organizations,
    organizationId,
    currentOrganization,
    role,
    /**
     * Every role the membership holds.
     *
     * `role` above is `roles[0]`, which is enough to answer "may they do this?"
     * (the widest wins) but is **lossy** for anything that asks *which* roles.
     * `admin@example.local` is stored `[OWNER, DEPARTMENT]`, so a caller reading
     * `role` alone concludes they do not run a department desk — and they do.
     *
     * Prefer this wherever the question is about role membership rather than
     * rank: role-targeted announcements, desk resolution, visibility scoping.
     */
    roles: roles ?? [role],
    isScopedToOwnRecords,
    userOrganizations,
    canSeeAllBookings,
    canSeeAllCustody,
    canUseBarcodes,
    canUseAudits,
  };
}

/**
 * Splits a comma-separated `SsoDetails` group-id field into a normalized list of
 * lower-cased, trimmed, non-empty ids. Mirrors the comma-separated convention
 * already used by `SsoDetails.domain`, so one role can map to several IdP groups
 * without a schema change.
 *
 * @param field - Raw group-id field (`adminGroupId` | `selfServiceGroupId` | `baseUserGroupId`)
 * @returns Normalized group ids (possibly empty)
 */
function parseGroupIds(field: string | null | undefined): string[] {
  return (field ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Returns true if the group id(s) configured on a role field are present in the
 * SAML `groups` claim. Matching is trimmed + case-insensitive.
 *
 * Two match modes, checked in order, so both real-world value shapes work:
 *  1. Whole-field match — the entire trimmed field equals a claim value. Supports
 *     values that themselves contain commas, e.g. LDAP DNs like
 *     `cn=shelf-base,ou=groups,dc=example,dc=edu`.
 *  2. Comma-separated list — the field is split on commas and any token matches.
 *     Supports mapping several comma-free groups (names, Grouper paths, entitlement
 *     URIs, scoped affiliations) to one role.
 *
 * A field containing `=` is treated as a single DN-style value (whole-field only),
 * NOT split on commas — otherwise a DN's components (`dc=edu`, `ou=groups`) would
 * each become match candidates and could falsely grant a role. Consequence: you
 * cannot comma-list multiple DN values in one field (map them to separate roles,
 * or use comma-free identifiers).
 *
 * @param field - The role's configured group-id field on `SsoDetails`
 * @param claimGroups - The `groups` claim values from the SAML assertion
 */
function groupClaimMatches(
  field: string | null | undefined,
  claimGroups: string[],
): boolean {
  const whole = (field ?? "").trim().toLowerCase();
  if (!whole) return false;
  const claims = claimGroups.map((value) => value.trim().toLowerCase());
  // 1. Whole-field exact match (handles comma-bearing values like LDAP DNs).
  if (claims.includes(whole)) return true;
  // 2. A DN-style value (contains "=") is a single value only — never split it,
  //    so its components can't become false matches.
  if (whole.includes("=")) return false;
  // 3. Otherwise treat the field as a comma-separated list of individual group ids.
  return parseGroupIds(field).some((id) => claims.includes(id));
}

/**
 * Resolves the Shelf organization role for an SSO user from the SAML `groups`
 * claim, using the group ids mapped on `SsoDetails`. Precedence is
 * ADMIN > SELF_SERVICE > BASE: if the user is in groups for multiple roles, the
 * highest wins. Returns `null` when no configured group matches (the caller then
 * grants no org access → the user lands on `/sso-pending-assignment`).
 *
 * @param ssoDetails - The org's SSO config (holds the per-role group ids)
 * @param groupIds - The `groups` claim values from the SAML assertion
 * @returns The resolved role, or `null` if none matched
 */
export function getRoleFromGroupId(
  ssoDetails: SsoDetails,
  groupIds: string[],
): OrganizationRoles | null {
  // We prioritize the admin group. If the user is in several, the highest role wins.
  if (groupClaimMatches(ssoDetails.adminGroupId, groupIds)) {
    return OrganizationRoles.ADMIN;
  } else if (groupClaimMatches(ssoDetails.selfServiceGroupId, groupIds)) {
    return OrganizationRoles.SELF_SERVICE;
  } else if (groupClaimMatches(ssoDetails.baseUserGroupId, groupIds)) {
    return OrganizationRoles.BASE;
  } else {
    return null;
  }
}

/**
 * Like {@link requirePermission}, but admits the caller if **any** of the given
 * permissions holds.
 *
 * For layout routes that are only a container: `/settings` draws a tab strip
 * and an `<Outlet/>`, and every tab's own route already enforces its own
 * permission. Demanding one specific permission at the container turns it into
 * a second, stricter gate that the tabs know nothing about — which is exactly
 * how four operational roles ended up seeing «الفريق» in the sidebar and
 * getting *Unauthorized* when they clicked it.
 *
 * Same return shape as {@link requirePermission}, so a caller can swap one for
 * the other without touching the rest of the loader.
 *
 * @param args.userId - The signed-in user
 * @param args.request - Used to resolve the selected workspace
 * @param args.permissions - Entity/action pairs; one match is enough
 * @returns The same context {@link requirePermission} returns
 * @throws {ShelfError} 403 when none of the permissions hold
 */
export async function requireAnyPermission({
  userId,
  request,
  permissions,
}: {
  userId: string;
  request: Request;
  permissions: ReadonlyArray<{
    entity: PermissionEntity;
    action: PermissionAction;
  }>;
}) {
  const { roles } = await resolveRequestRoles({ userId, request });

  const granted = permissions.some(({ entity, action }) =>
    userHasPermission({ roles: roles ?? [], entity, action }),
  );

  if (!granted) {
    throw new ShelfError({
      cause: null,
      title: "Unauthorized",
      message: "You have no permission to perform this action",
      additionalData: { userId, permissions },
      label: "Permission",
      status: 403,
      shouldBeCaptured: false,
    });
  }

  return buildPermissionContext({ userId, request });
}
