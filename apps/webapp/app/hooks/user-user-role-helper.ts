import { OrganizationRoles } from "@prisma/client";
import { useRouteLoaderData } from "react-router";
import type { loader } from "~/routes/_layout+/_layout";
import {
  hasOrgWideNonOwnerRole,
  rolesAreScopedToOwnRecords,
} from "~/utils/permissions/role-scope";

/**
 * Exposes the current user's organization roles, plus the derived flags UI code
 * needs to decide what to render.
 *
 * ## Which flag to reach for
 *
 * - **Rendering an action a role may or may not perform** → do NOT use this
 *   hook's booleans. Use `userHasPermission({ roles, entity, action })` from
 *   `permission.validator.client`, so the button matches what the server will
 *   actually allow. `roles` returned here is the input for it.
 * - **Deciding whether the user only sees their own records** →
 *   `isScopedToOwnRecords`.
 * - **Wording that genuinely differs per role** (e.g. "Take custody" vs "Assign
 *   custody") → `isSelfService`. That is a copy decision, not a gate.
 *
 * The old `isBaseOrSelfService` flag is gone: it meant "not an administrator",
 * which silently promoted every organization role added afterwards. See
 * `role-scope.ts` for the reasoning.
 */
export function useUserRoleHelper() {
  const roles = useRouteLoaderData<typeof loader>("routes/_layout+/_layout")
    ?.currentOrganizationUserRoles;

  const isAdministrator = roles?.includes(OrganizationRoles.ADMIN) || false;
  const isOwner = roles?.includes(OrganizationRoles.OWNER) || false;
  const isAdministratorOrOwner = isAdministrator || isOwner;

  const isSelfService =
    roles?.includes(OrganizationRoles.SELF_SERVICE) || false;
  const isBase = roles?.includes(OrganizationRoles.BASE) || false;

  /**
   * True when the user only ever sees records they are attached to.
   *
   * Derived from the shared allow-list, so it stays in step with the server's
   * `requirePermission().isScopedToOwnRecords` — the two must agree or the UI
   * will offer actions the loader then refuses.
   */
  const isScopedToOwnRecords = rolesAreScopedToOwnRecords(roles);

  /**
   * True for organization-wide roles other than OWNER. Only for policies that
   * deliberately exempt the owner — see `hasOrgWideNonOwnerRole`'s docblock.
   */
  const isOrgWideNonOwner = hasOrgWideNonOwnerRole(roles);

  return {
    roles,
    isAdministrator,
    isOwner,
    isAdministratorOrOwner,
    isSelfService,
    isBase,
    isScopedToOwnRecords,
    isOrgWideNonOwner,
  };
}
