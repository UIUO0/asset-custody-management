import { OrganizationRoles } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { Role2PermissionMap } from "./permission.data";
import {
  hasOrgWideNonOwnerRole,
  hasWorkspaceAdminRole,
  rolesAreScopedToOwnRecords,
  ROLES_WITH_ORG_WIDE_VISIBILITY,
} from "./role-scope";

/**
 * These tests exist to protect one property above all others: **a role nobody
 * remembered to register must not gain organization-wide data visibility.**
 *
 * The pre-EPDA code derived scope negatively (`role === SELF_SERVICE || role
 * === BASE`), so every role added afterwards silently defaulted to seeing the
 * whole organization. The allow-list inverts that, and the "unregistered role"
 * test below is what stops the old shape creeping back in.
 */
describe("rolesAreScopedToOwnRecords", () => {
  it("scopes the two restricted upstream roles to their own records", () => {
    expect(rolesAreScopedToOwnRecords(OrganizationRoles.BASE)).toBe(true);
    expect(rolesAreScopedToOwnRecords(OrganizationRoles.SELF_SERVICE)).toBe(
      true,
    );
  });

  it("gives organization-wide visibility to every allow-listed role", () => {
    for (const role of ROLES_WITH_ORG_WIDE_VISIBILITY) {
      expect(rolesAreScopedToOwnRecords(role)).toBe(false);
    }
  });

  it("gives the three EPDA operational roles organization-wide visibility", () => {
    expect(rolesAreScopedToOwnRecords(OrganizationRoles.WAREHOUSE)).toBe(false);
    expect(rolesAreScopedToOwnRecords(OrganizationRoles.FINANCE)).toBe(false);
    expect(rolesAreScopedToOwnRecords(OrganizationRoles.INVENTORY)).toBe(false);
  });

  it("fails closed for a role that is not on the allow-list", () => {
    // why: simulates someone adding a value to the Prisma enum and forgetting
    // role-scope.ts. Under the old deny-list this returned `false` — full
    // organization visibility. It must now return `true`.
    const unregistered = "SOME_FUTURE_ROLE" as OrganizationRoles;

    expect(ROLES_WITH_ORG_WIDE_VISIBILITY).not.toContain(unregistered);
    expect(rolesAreScopedToOwnRecords(unregistered)).toBe(true);
  });

  it("fails closed for missing or empty membership", () => {
    expect(rolesAreScopedToOwnRecords(undefined)).toBe(true);
    expect(rolesAreScopedToOwnRecords(null)).toBe(true);
    expect(rolesAreScopedToOwnRecords([])).toBe(true);
  });

  it("grants the widest scope any single held role allows", () => {
    expect(
      rolesAreScopedToOwnRecords([
        OrganizationRoles.BASE,
        OrganizationRoles.WAREHOUSE,
      ]),
    ).toBe(false);

    expect(
      rolesAreScopedToOwnRecords([
        OrganizationRoles.BASE,
        OrganizationRoles.SELF_SERVICE,
      ]),
    ).toBe(true);
  });
});

describe("hasOrgWideNonOwnerRole", () => {
  it("excludes the owner", () => {
    expect(hasOrgWideNonOwnerRole(OrganizationRoles.OWNER)).toBe(false);
  });

  it("includes ADMIN and the EPDA operational roles", () => {
    expect(hasOrgWideNonOwnerRole(OrganizationRoles.ADMIN)).toBe(true);
    expect(hasOrgWideNonOwnerRole(OrganizationRoles.WAREHOUSE)).toBe(true);
    expect(hasOrgWideNonOwnerRole(OrganizationRoles.FINANCE)).toBe(true);
    expect(hasOrgWideNonOwnerRole(OrganizationRoles.INVENTORY)).toBe(true);
  });

  it("excludes roles scoped to their own records", () => {
    expect(hasOrgWideNonOwnerRole(OrganizationRoles.BASE)).toBe(false);
    expect(hasOrgWideNonOwnerRole(OrganizationRoles.SELF_SERVICE)).toBe(false);
  });

  it("treats an owner who also holds another role as an owner", () => {
    expect(
      hasOrgWideNonOwnerRole([
        OrganizationRoles.OWNER,
        OrganizationRoles.WAREHOUSE,
      ]),
    ).toBe(false);
  });
});

describe("hasWorkspaceAdminRole", () => {
  it("is true only for OWNER and ADMIN", () => {
    expect(hasWorkspaceAdminRole(OrganizationRoles.OWNER)).toBe(true);
    expect(hasWorkspaceAdminRole(OrganizationRoles.ADMIN)).toBe(true);
  });

  it("is false for roles that see everything but administer nothing", () => {
    // Seeing the whole organization is not the same as being able to change
    // its settings — WAREHOUSE and INVENTORY read widely, administer nothing.
    expect(hasWorkspaceAdminRole(OrganizationRoles.WAREHOUSE)).toBe(false);
    expect(hasWorkspaceAdminRole(OrganizationRoles.FINANCE)).toBe(false);
    expect(hasWorkspaceAdminRole(OrganizationRoles.INVENTORY)).toBe(false);
    expect(hasWorkspaceAdminRole(undefined)).toBe(false);
  });
});

describe("Role2PermissionMap coverage for EPDA roles", () => {
  const epdaRoles = [
    OrganizationRoles.WAREHOUSE,
    OrganizationRoles.FINANCE,
    OrganizationRoles.INVENTORY,
  ];

  it("registers every EPDA role in the permission map", () => {
    // why: an unregistered role is denied everything by `hasPermission`, which
    // is safe but silently unusable. Catch it here rather than in production.
    for (const role of epdaRoles) {
      expect(Role2PermissionMap[role]).toBeDefined();
    }
  });

  it("withholds workspace administration from all three", () => {
    for (const role of epdaRoles) {
      expect(Role2PermissionMap[role]?.workspace).toEqual([]);
      expect(Role2PermissionMap[role]?.generalSettings).toEqual([]);
      expect(Role2PermissionMap[role]?.subscription).toEqual([]);
    }
  });

  it("matches the approved permission matrix on asset deletion", () => {
    // The matrix assigns asset deletion to المخزون (INVENTORY) alone.
    expect(Role2PermissionMap.INVENTORY?.asset).toContain("delete");
    expect(Role2PermissionMap.WAREHOUSE?.asset).not.toContain("delete");
    expect(Role2PermissionMap.FINANCE?.asset).not.toContain("delete");
  });

  it("lets FINANCE edit assets but never create them", () => {
    // why: finance annotates assets the warehouse registered. `import` is part
    // of this assertion because `assets.import` (bulk CREATE) and
    // `assets.import-update` share the `asset.import` action — granting it
    // would be creation through the back door.
    expect(Role2PermissionMap.FINANCE?.asset).toContain("update");
    expect(Role2PermissionMap.FINANCE?.asset).not.toContain("create");
    expect(Role2PermissionMap.FINANCE?.asset).not.toContain("import");
  });

  it("gives approval rights to WAREHOUSE only", () => {
    expect(Role2PermissionMap.WAREHOUSE?.asset).toContain("approve");
    expect(Role2PermissionMap.FINANCE?.asset).not.toContain("approve");
    expect(Role2PermissionMap.INVENTORY?.asset).not.toContain("approve");
  });

  it("keeps the team directory read-only for all three", () => {
    for (const role of epdaRoles) {
      expect(Role2PermissionMap[role]?.teamMember).toEqual(["read"]);
    }
  });
});
