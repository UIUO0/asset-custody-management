/**
 * Where a user lands when no destination was requested — the database side.
 *
 * The rule itself is pure and lives in `landing-route.ts`; this module only
 * looks up the roles to feed it. The constants and `resolveLandingRoute` are
 * re-exported so existing call sites keep one import, and so nothing has to
 * know which half it needs.
 *
 * @see {@link file://./landing-route.ts} — the rule, and why it is separate
 */

import { getSelectedOrganization } from "~/modules/organization/context.server";
import {
  resolveLandingRoute,
  SCOPED_USER_LANDING_ROUTE,
} from "~/utils/landing-route";

export {
  ORG_WIDE_LANDING_ROUTE,
  resolveLandingRoute,
  SCOPED_USER_LANDING_ROUTE,
} from "~/utils/landing-route";

/**
 * Resolves the landing route for a user by looking up their role in whichever
 * organisation they are about to enter.
 *
 * Costs no extra query: `getSelectedOrganization` already fetches the
 * membership rows (with `roles`) and caches them per request, so this reuses
 * the same round trip the caller is making anyway to set the org cookie.
 *
 * Never throws for a missing membership — an unresolvable role falls back to
 * the narrowest landing page, matching how `rolesAreScopedToOwnRecords` fails
 * closed everywhere else.
 *
 * @param userId - The authenticated user
 * @param request - Incoming request, used to read the selected-organisation cookie
 * @returns The path to redirect to
 */
export async function getLandingRouteForUser({
  userId,
  request,
}: {
  userId: string;
  request: Request;
}): Promise<string> {
  try {
    const { organizationId, userOrganizations } = await getSelectedOrganization(
      {
        userId,
        request,
      },
    );

    const roles = userOrganizations.find(
      (membership) => membership.organizationId === organizationId,
    )?.roles;

    return resolveLandingRoute(roles);
  } catch {
    // A user with no usable organisation is about to be redirected somewhere
    // else entirely (onboarding, "no workspace" screens). Returning the
    // restrictive default keeps this helper from turning that into a 500.
    return SCOPED_USER_LANDING_ROUTE;
  }
}
