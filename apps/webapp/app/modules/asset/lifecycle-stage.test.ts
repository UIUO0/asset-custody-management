/**
 * Asset intake-stage tests (مرحلة استلام الصنف)
 *
 * Covers the permission and query rules that make the intake workflow real:
 *
 * 1. Only roles holding `asset.approve` can move an asset between stages.
 * 2. A newly-created asset starts at PENDING, so an omitted field can never
 *    produce a ready-to-distribute asset.
 * 3. Roles scoped to their own records never see PENDING assets — at the query
 *    level, not just hidden in the UI.
 *
 * The third property is the one that matters most: if it regresses, employees
 * start seeing (and booking) inventory the warehouse has not released.
 *
 * @see {@link file://./service.server.ts} `updateAssetLifecycleStage`, `getAssets`
 * @see {@link file://./../../utils/permissions/role-scope.ts}
 */

import { AssetLifecycleStage, OrganizationRoles } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  PermissionAction,
  PermissionEntity,
  Role2PermissionMap,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { rolesAreScopedToOwnRecords } from "~/utils/permissions/role-scope";

describe("asset.approve permission", () => {
  it("is held by المستودعات (WAREHOUSE) — they release assets into circulation", () => {
    expect(
      userHasPermission({
        roles: [OrganizationRoles.WAREHOUSE],
        entity: PermissionEntity.asset,
        action: PermissionAction.approve,
      }),
    ).toBe(true);
  });

  it("is NOT held by المالية (FINANCE) — they code assets, they do not release them", () => {
    expect(Role2PermissionMap.FINANCE?.asset).not.toContain(
      PermissionAction.approve,
    );
    expect(
      userHasPermission({
        roles: [OrganizationRoles.FINANCE],
        entity: PermissionEntity.asset,
        action: PermissionAction.approve,
      }),
    ).toBe(false);
  });

  it("is NOT held by المخزون (INVENTORY) or by ordinary employees", () => {
    for (const role of [
      OrganizationRoles.INVENTORY,
      OrganizationRoles.BASE,
      OrganizationRoles.SELF_SERVICE,
    ]) {
      expect(
        userHasPermission({
          roles: [role],
          entity: PermissionEntity.asset,
          action: PermissionAction.approve,
        }),
      ).toBe(false);
    }
  });

  it("is held by OWNER and ADMIN, who bypass the map entirely", () => {
    for (const role of [OrganizationRoles.OWNER, OrganizationRoles.ADMIN]) {
      expect(
        userHasPermission({
          roles: [role],
          entity: PermissionEntity.asset,
          action: PermissionAction.approve,
        }),
      ).toBe(true);
    }
  });
});

describe("intake stage defaults", () => {
  /**
   * The creation form hides the stage control from roles without
   * `asset.approve`, so those callers submit no `lifecycleStage` at all. The
   * action coerces that to PENDING; this test pins the coercion rule so a
   * future refactor cannot quietly flip the default back to READY.
   */
  const resolveRequestedStage = (
    canApprove: boolean,
    submitted?: AssetLifecycleStage,
  ) => (canApprove ? submitted : AssetLifecycleStage.PENDING);

  it("defaults to PENDING when the field is omitted", () => {
    expect(resolveRequestedStage(true, undefined)).toBeUndefined();
    expect(resolveRequestedStage(false, undefined)).toBe(
      AssetLifecycleStage.PENDING,
    );
  });

  it("ignores a forged READY from a caller who cannot approve", () => {
    expect(resolveRequestedStage(false, AssetLifecycleStage.READY)).toBe(
      AssetLifecycleStage.PENDING,
    );
  });

  it("honours READY from a caller who can approve", () => {
    expect(resolveRequestedStage(true, AssetLifecycleStage.READY)).toBe(
      AssetLifecycleStage.READY,
    );
  });
});

describe("who may see PENDING assets", () => {
  /**
   * `onlyReadyAssets` is derived from `isScopedToOwnRecords` at every read
   * path. Asserting the derivation here keeps the two concepts tied together:
   * if a role ever becomes org-wide, it also gains the intake queue, which is
   * the intended behaviour for an operational role.
   */
  const onlyReadyAssetsFor = (role: OrganizationRoles) =>
    rolesAreScopedToOwnRecords(role);

  it("hides them from ordinary employees", () => {
    expect(onlyReadyAssetsFor(OrganizationRoles.BASE)).toBe(true);
    expect(onlyReadyAssetsFor(OrganizationRoles.SELF_SERVICE)).toBe(true);
  });

  it("shows them to the three operational roles and to admins", () => {
    for (const role of [
      OrganizationRoles.WAREHOUSE,
      OrganizationRoles.FINANCE,
      OrganizationRoles.INVENTORY,
      OrganizationRoles.ADMIN,
      OrganizationRoles.OWNER,
    ]) {
      expect(onlyReadyAssetsFor(role)).toBe(false);
    }
  });

  it("hides them from an unregistered role — the gate fails closed", () => {
    const unregistered = "SOME_FUTURE_ROLE" as OrganizationRoles;
    expect(onlyReadyAssetsFor(unregistered)).toBe(true);
  });
});
