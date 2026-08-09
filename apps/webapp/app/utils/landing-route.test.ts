/**
 * Landing-route tests.
 *
 * Every authenticated entry point used to send the user to `/assets`, the
 * organisation-wide register — a page the sidebar explicitly hides from roles
 * scoped to their own records. So an employee logged in and immediately landed
 * on inventory they cannot act on, in a section their own navigation says is
 * not theirs.
 *
 * The property worth pinning is the fail-closed one: a role nobody registered
 * must land on the employee page, not on the register. That is the same
 * direction `rolesAreScopedToOwnRecords` fails in, and keeping the two aligned
 * is the whole point of deriving this from the allow-list rather than listing
 * roles here.
 *
 * @see {@link file://./landing-route.ts}
 * @see {@link file://./permissions/role-scope.ts}
 */

import { OrganizationRoles } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  ORG_WIDE_LANDING_ROUTE,
  SCOPED_USER_LANDING_ROUTE,
  resolveLandingRoute,
} from "./landing-route";

describe("resolveLandingRoute", () => {
  it.each([OrganizationRoles.SELF_SERVICE, OrganizationRoles.BASE])(
    "sends %s to their own custody",
    (role) => {
      expect(resolveLandingRoute(role)).toBe(SCOPED_USER_LANDING_ROUTE);
    },
  );

  it.each([
    OrganizationRoles.OWNER,
    OrganizationRoles.ADMIN,
    OrganizationRoles.WAREHOUSE,
    OrganizationRoles.FINANCE,
    OrganizationRoles.INVENTORY,
  ])("sends %s to the asset register", (role) => {
    expect(resolveLandingRoute(role)).toBe(ORG_WIDE_LANDING_ROUTE);
  });

  it("sends an unknown or missing role to the employee page", () => {
    // Fail closed, exactly like `rolesAreScopedToOwnRecords`: a role added to
    // the enum but never registered in the allow-list must not be handed the
    // organisation-wide register by default.
    expect(resolveLandingRoute(undefined)).toBe(SCOPED_USER_LANDING_ROUTE);
    expect(resolveLandingRoute(null)).toBe(SCOPED_USER_LANDING_ROUTE);
    expect(resolveLandingRoute([])).toBe(SCOPED_USER_LANDING_ROUTE);
  });

  it("gives a multi-role user the widest landing page they earn", () => {
    expect(
      resolveLandingRoute([
        OrganizationRoles.SELF_SERVICE,
        OrganizationRoles.WAREHOUSE,
      ]),
    ).toBe(ORG_WIDE_LANDING_ROUTE);
  });
});
