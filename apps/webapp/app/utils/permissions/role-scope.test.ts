import { OrganizationRoles } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PermissionAction, Role2PermissionMap } from "./permission.data";
import {
  hasOrgWideNonOwnerRole,
  hasWorkspaceAdminRole,
  rolesAreScopedToOwnRecords,
  resolveDepartmentDeskId,
  ROLES_WITH_ORG_WIDE_VISIBILITY,
  visibleCustodianIds,
} from "./role-scope";

/**
 * These tests exist to protect one property above all others: **a role nobody
 * remembered to register must not gain organization-wide data visibility.**
 *
 * The pre-ORG code derived scope negatively (`role === SELF_SERVICE || role
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

  it("gives the three ORG operational roles organization-wide visibility", () => {
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

  it("includes ADMIN and the ORG operational roles", () => {
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

describe("Role2PermissionMap coverage for ORG roles", () => {
  const orgRoles = [
    OrganizationRoles.WAREHOUSE,
    OrganizationRoles.FINANCE,
    OrganizationRoles.INVENTORY,
  ];

  it("registers every ORG role in the permission map", () => {
    // why: an unregistered role is denied everything by `hasPermission`, which
    // is safe but silently unusable. Catch it here rather than in production.
    for (const role of orgRoles) {
      expect(Role2PermissionMap[role]).toBeDefined();
    }
  });

  it("withholds workspace administration from all three", () => {
    for (const role of orgRoles) {
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
    for (const role of orgRoles) {
      expect(Role2PermissionMap[role]?.teamMember).toEqual(["read"]);
    }
  });
});

/**
 * `DEPARTMENT` (إدارة المرافق) is a third scope: narrower than the workspace,
 * wider than one person. These tests pin both halves of that — it must not see
 * everything, and it must not be reduced to seeing only its own staff member's
 * personal custody, which would show a department desk nothing at all.
 */
describe("DEPARTMENT scope", () => {
  const DEPT = "tm-facilities";
  const OWN = "tm-me";

  it("does not grant organization-wide visibility", () => {
    // The desk receives stock; it does not supervise the register.
    expect(rolesAreScopedToOwnRecords(OrganizationRoles.DEPARTMENT)).toBe(true);
    expect(ROLES_WITH_ORG_WIDE_VISIBILITY).not.toContain(
      OrganizationRoles.DEPARTMENT,
    );
  });

  it("is not a workspace administrator", () => {
    expect(hasWorkspaceAdminRole(OrganizationRoles.DEPARTMENT)).toBe(false);
  });

  it("sees its department's custody alongside its own", () => {
    const ids = visibleCustodianIds({
      roles: [OrganizationRoles.DEPARTMENT],
      ownTeamMemberId: OWN,
      departmentTeamMemberId: DEPT,
    });

    expect(ids).toEqual(expect.arrayContaining([OWN, DEPT]));
    expect(ids).toHaveLength(2);
  });

  it("does not leak a department to an employee who merely belongs to one", () => {
    // why: the pointer records where someone works, the role is what grants the
    // desk's view. Reading the pointer alone would hand every employee of a
    // department the whole department's stock.
    const ids = visibleCustodianIds({
      roles: [OrganizationRoles.BASE],
      ownTeamMemberId: OWN,
      departmentTeamMemberId: DEPT,
    });

    expect(ids).toEqual([OWN]);
  });

  it("returns null — meaning do not filter — for organization-wide roles", () => {
    expect(
      visibleCustodianIds({
        roles: [OrganizationRoles.WAREHOUSE],
        ownTeamMemberId: OWN,
        departmentTeamMemberId: DEPT,
      }),
    ).toBeNull();
  });

  it("returns an empty list, never null, for a scoped user with no rows", () => {
    // why: `null` means "no filter" downstream. A scoped user who resolves to
    // nothing must produce `[]` (show nothing), not `null` (show everything) —
    // the difference between an empty page and a full data leak.
    expect(
      visibleCustodianIds({
        roles: [OrganizationRoles.BASE],
        ownTeamMemberId: null,
      }),
    ).toEqual([]);
  });

  it("can hand over but cannot create, approve or delete assets", () => {
    const dept = Role2PermissionMap.DEPARTMENT?.asset;
    expect(dept).toContain("custody");
    expect(dept).toContain("read");
    expect(dept).not.toContain("create");
    expect(dept).not.toContain("approve");
    expect(dept).not.toContain("delete");
    expect(dept).not.toContain("import");
  });

  it("cannot author goods receipts", () => {
    // Stock enters through /receipts, and the desk signs for it rather than
    // writing it — otherwise a department could author what it was handed.
    expect(Role2PermissionMap.DEPARTMENT?.goodsReceipt).toEqual([]);
  });
});

/**
 * `admin@example.local` is BOTH the workspace owner and the officer who receives
 * for إدارة تقنية المعلومات — the authority runs IT on the admin account.
 *
 * That combination broke the first implementation: the desk was derived from
 * visibility, and an owner is never "filtered", so the answer came back "no
 * desk" for exactly the account that speaks for it. These pin that the desk is
 * a function of role + pointer, nothing else.
 */
describe("resolveDepartmentDeskId", () => {
  const IT_DESK = "tm-it";

  it("gives an owner who also holds DEPARTMENT their desk", () => {
    expect(
      resolveDepartmentDeskId({
        roles: [OrganizationRoles.OWNER, OrganizationRoles.DEPARTMENT],
        departmentTeamMemberId: IT_DESK,
      }),
    ).toBe(IT_DESK);
  });

  it("gives an owner WITHOUT the department role nothing", () => {
    // why: the pointer alone must never confer the desk — that is what stops a
    // stray membership row handing someone a department's stock.
    expect(
      resolveDepartmentDeskId({
        roles: [OrganizationRoles.OWNER],
        departmentTeamMemberId: IT_DESK,
      }),
    ).toBeNull();
  });

  it("gives a department holder with no pointer nothing", () => {
    expect(
      resolveDepartmentDeskId({
        roles: [OrganizationRoles.DEPARTMENT],
        departmentTeamMemberId: null,
      }),
    ).toBeNull();
  });

  it("still returns null — do not filter — from visibleCustodianIds for that owner", () => {
    // The two questions stay separate: the owner sees everything (`null`), and
    // separately speaks for a desk. Neither answer may be derived from the other.
    expect(
      visibleCustodianIds({
        roles: [OrganizationRoles.OWNER, OrganizationRoles.DEPARTMENT],
        ownTeamMemberId: "tm-me",
        departmentTeamMemberId: IT_DESK,
      }),
    ).toBeNull();
  });
});

/**
 * `requirePermission` collapses a membership to `roles[0]`.
 *
 * That is fine for permission checks — the widest role wins anyway — but it is
 * lossy, and any caller that needs "does this person hold DEPARTMENT?" must
 * read the full array from the membership instead. Passing the collapsed value
 * is what hid IT's stock from `admin@example.local`, whose roles are stored as
 * `[OWNER, DEPARTMENT]`: `roles[0]` is `OWNER`, and the desk resolved to null.
 */
describe("resolveDepartmentDeskId — multi-role memberships", () => {
  const IT_DESK = "tm-it";

  it("finds the desk regardless of where DEPARTMENT sits in the array", () => {
    for (const roles of [
      [OrganizationRoles.OWNER, OrganizationRoles.DEPARTMENT],
      [OrganizationRoles.DEPARTMENT, OrganizationRoles.OWNER],
    ]) {
      expect(
        resolveDepartmentDeskId({ roles, departmentTeamMemberId: IT_DESK }),
      ).toBe(IT_DESK);
    }
  });

  it("returns null when only the first role is passed", () => {
    // why: this is the failure mode itself — a caller handing over
    // `[requirePermission().role]` instead of the membership's full list.
    expect(
      resolveDepartmentDeskId({
        roles: [OrganizationRoles.OWNER],
        departmentTeamMemberId: IT_DESK,
      }),
    ).toBeNull();
  });
});

/**
 * Who may destroy things.
 *
 * The authority is deliberately narrow: المخزون prune the register, and nobody
 * else operational deletes anything. المستودعات keep exactly one delete —
 * `goodsReceipt` — and that one is narrowed further at the service, which
 * refuses a document whose signatures are complete (see `deleteGoodsReceipt`).
 * They can therefore undo their own data entry right up until someone signs
 * it, and no further.
 *
 * These assertions are the policy, not a description of it. A `delete` added to
 * an operational role fails here, which is the point — the map is edited far
 * more often than this decision is revisited.
 */
describe("deletion authority", () => {
  /** Every entity a role may delete, read straight from the map. */
  function deletableEntities(role: OrganizationRoles): string[] {
    const entry = Role2PermissionMap[role] ?? {};

    return Object.entries(entry)
      .filter(([, actions]) =>
        (actions as PermissionAction[]).includes(PermissionAction.delete),
      )
      .map(([entity]) => entity)
      .sort();
  }

  it("gives المخزون the register-wide delete", () => {
    expect(deletableEntities(OrganizationRoles.INVENTORY)).toEqual([
      "asset",
      "goodsReceipt",
    ]);
  });

  it("gives المستودعات only the goods receipt", () => {
    // Not `asset`: that is what lets a caller erase a signed document, and the
    // service reads it as exactly that. Adding it here silently widens the
    // signature rule too.
    expect(deletableEntities(OrganizationRoles.WAREHOUSE)).toEqual([
      "goodsReceipt",
    ]);
  });

  it("gives المالية nothing to delete", () => {
    // Finance re-codes items; it does not remove them.
    expect(deletableEntities(OrganizationRoles.FINANCE)).toEqual([]);
  });

  it.each([
    OrganizationRoles.DEPARTMENT,
    OrganizationRoles.SELF_SERVICE,
    OrganizationRoles.BASE,
  ])("gives %s nothing to delete", (role) => {
    expect(deletableEntities(role)).toEqual([]);
  });

  it("leaves erasing a signed document to whoever may delete an asset", () => {
    // The property the services rely on: `goodsReceipt.delete` says who may
    // erase, `asset.delete` says how far. If the two ever coincide for an
    // operational role, the signature rule stops distinguishing anyone.
    const canEraseSigned = [
      OrganizationRoles.WAREHOUSE,
      OrganizationRoles.FINANCE,
      OrganizationRoles.INVENTORY,
    ].filter((role) => deletableEntities(role).includes("asset"));

    expect(canEraseSigned).toEqual([OrganizationRoles.INVENTORY]);
  });
});
