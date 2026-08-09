/**
 * Where a user lands when no destination was requested — pure logic.
 *
 * Every authenticated entry point — signing in, hitting `/`, following an OTP
 * or SSO callback — used to hardcode `/assets`. That is the organisation-wide
 * asset register, and for a role scoped to its own records it is the wrong
 * place twice over: the sidebar deliberately hides `/assets` from them (see the
 * grouping in `use-sidebar-nav-items.tsx`), so the app opened on a page its own
 * navigation says they should not be using, showing inventory they cannot act
 * on. An employee's home is the assets they are actually holding.
 *
 * Resolved from the same allow-list that governs data scope, so a role added
 * later inherits the employee landing page by default rather than being sent to
 * an inventory tool nobody registered it for.
 *
 * This only supplies the **default**. An explicit `redirectTo` (a deep link the
 * user was bounced off when their session expired) always wins — call sites
 * pass it through `safeRedirect` first and fall back to this.
 *
 * ## Why this is not in `landing-route.server.ts`
 *
 * The database lookup lives there, and importing that module instantiates the
 * Prisma client. A unit test for the pure function alone therefore opened a
 * real connection and failed with `P1001` on any machine without Postgres —
 * leaking an unhandled rejection that Vitest attributed to whichever file ran
 * next. That is the trap recorded in `CLAUDE.md`, and the fix is the same one
 * `custody/handover.ts` uses: pure logic in a neutral module, the database in
 * the `.server` one.
 *
 * @see {@link file://./landing-route.server.ts} — the lookup that uses this
 * @see {@link file://./permissions/role-scope.ts} — the allow-list
 * @see {@link file://./../hooks/use-sidebar-nav-items.tsx} — the same split, in the nav
 */

import type { OrganizationRoles } from "@prisma/client";
import { rolesAreScopedToOwnRecords } from "~/utils/permissions/role-scope";

/** Landing page for roles that only ever see their own records. */
export const SCOPED_USER_LANDING_ROUTE = "/my-custody";

/** Landing page for roles with organisation-wide visibility. */
export const ORG_WIDE_LANDING_ROUTE = "/assets";

/**
 * Picks the landing route for a set of roles.
 *
 * Pure and synchronous — separated from the lookup so it can be unit tested
 * without a database, and reused anywhere the roles are already known.
 *
 * @param roles - The user's roles in the organisation they are entering
 * @returns The path to redirect to
 */
export function resolveLandingRoute(
  roles: OrganizationRoles | OrganizationRoles[] | undefined | null,
): string {
  return rolesAreScopedToOwnRecords(roles)
    ? SCOPED_USER_LANDING_ROUTE
    : ORG_WIDE_LANDING_ROUTE;
}
