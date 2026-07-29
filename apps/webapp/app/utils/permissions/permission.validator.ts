/**
 * Isomorphic permission check.
 *
 * Answers "may a user holding these roles perform this action on this entity?"
 * by looking the pair up in {@link Role2PermissionMap}. It is a pure function
 * over a static map — no database, no browser API — so it is safe to call in a
 * loader, in an action, during server-side rendering, and in the browser.
 *
 * ## Why this module exists
 *
 * The same function used to live only in `permission.validator.client.ts`. The
 * `.client` suffix makes React Router's vite plugin stub every export to
 * `undefined` in the **server** bundle, so calling it while rendering on the
 * server threw `TypeError: userHasPermission is not a function`. The codebase
 * worked around that by suppressing route SSR until hydration (see the comment
 * in `routes/_layout+/_layout.tsx`), which meant any component rendered
 * *outside* that suppressed subtree — the sidebar, for one — crashed the whole
 * document render with a bare 500.
 *
 * The suffix was never accurate: nothing here is client-only. Hosting the
 * implementation in a neutral module fixes the crash at the root and lets
 * server-rendered chrome gate on permissions like everything else.
 *
 * Every call site now imports from here. `permission.validator.client.ts`
 * remains only as a deprecated re-export so nothing breaks if a stray import
 * survives somewhere; it has no importers left and can be deleted.
 *
 * @see {@link file://./permission.validator.server.ts} — the server variant,
 *   which additionally falls back to a DB lookup when roles aren't supplied
 * @see {@link file://./role-scope.ts} — the separate question of *which rows*
 *   a role may see
 */

import type { OrganizationRoles } from "@prisma/client";
import {
  Role2PermissionMap,
  type PermissionAction,
  type PermissionEntity,
} from "./permission.data";

type UserHasPermissionArgs = {
  /** Role of the user for which we have to check for permission */
  roles: OrganizationRoles[] | undefined;

  /** Entity for which we have to check for permission */
  entity: PermissionEntity;

  /**
   * The  actions which we have to check. It can be a string of type PermissionAction or an array.
   * If an array is provided, then any single permission match will return `true`
   */
  action: PermissionAction | PermissionAction[];
};

/**
 * @param roles - The user's roles in the current organization. `undefined` or
 *   an empty list denies everything, so a missing membership can never grant.
 * @param entity - The entity being acted on.
 * @param action - A single action, or several — any one match grants.
 * @returns `true` when the roles allow the action on the entity.
 */
export function userHasPermission({
  roles,
  action,
  entity,
}: UserHasPermissionArgs) {
  if (!roles || !roles.length) return false;

  if (roles.includes("ADMIN") || roles.includes("OWNER")) {
    //owner and admin can do anything for now
    return true;
  }

  const actionsToCheck = typeof action === "string" ? [action] : action;

  const validRoles = roles.filter((role) => {
    const entityPermMap = Role2PermissionMap[role];

    if (!entityPermMap) {
      return false;
    }

    const permissions = entityPermMap[entity];

    return permissions.some((permission) =>
      actionsToCheck.includes(permission),
    );
  });

  return validRoles.length > 0;
}
