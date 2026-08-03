/**
 * Booking request workflow tests (مسار الطلبات)
 *
 * The property worth protecting here is the **separation of powers**:
 *
 * - المستودعات decide requests but cannot freeze one.
 * - المخزون freeze requests but can never decide one.
 *
 * If those ever collapse into a single capability, each role silently gains the
 * other's authority — which is exactly the failure the two-action design exists
 * to prevent. The tests below are what stops a well-meaning refactor from
 * "simplifying" `hold` into a weaker `approve`.
 *
 * @see {@link file://./request.server.ts}
 * @see {@link file://./../../utils/permissions/permission.data.ts}
 */

import { OrganizationRoles } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  PermissionAction,
  PermissionEntity,
  Role2PermissionMap,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";

const canBooking = (role: OrganizationRoles, action: PermissionAction) =>
  userHasPermission({
    roles: [role],
    entity: PermissionEntity.booking,
    action,
  });

describe("who decides booking requests", () => {
  it("gives المستودعات (WAREHOUSE) the decision", () => {
    expect(
      canBooking(OrganizationRoles.WAREHOUSE, PermissionAction.approve),
    ).toBe(true);
  });

  it("denies the decision to المخزون (INVENTORY) — they only review", () => {
    expect(Role2PermissionMap.INVENTORY?.booking).not.toContain(
      PermissionAction.approve,
    );
    expect(
      canBooking(OrganizationRoles.INVENTORY, PermissionAction.approve),
    ).toBe(false);
  });

  it("denies the decision to المالية and to employees", () => {
    for (const role of [
      OrganizationRoles.FINANCE,
      OrganizationRoles.BASE,
      OrganizationRoles.SELF_SERVICE,
    ]) {
      expect(canBooking(role, PermissionAction.approve)).toBe(false);
    }
  });
});

describe("who may freeze a request for review", () => {
  it("gives the hold to المخزون (INVENTORY)", () => {
    expect(canBooking(OrganizationRoles.INVENTORY, PermissionAction.hold)).toBe(
      true,
    );
  });

  it("does NOT give the hold to المستودعات — the hold is a check on them", () => {
    expect(Role2PermissionMap.WAREHOUSE?.booking).not.toContain(
      PermissionAction.hold,
    );
    expect(canBooking(OrganizationRoles.WAREHOUSE, PermissionAction.hold)).toBe(
      false,
    );
  });

  it("does not leak the hold to employees or المالية", () => {
    for (const role of [
      OrganizationRoles.FINANCE,
      OrganizationRoles.BASE,
      OrganizationRoles.SELF_SERVICE,
    ]) {
      expect(canBooking(role, PermissionAction.hold)).toBe(false);
    }
  });
});

describe("the two capabilities never coincide outside admins", () => {
  /**
   * OWNER and ADMIN bypass the permission map entirely, so they legitimately
   * hold both. Every other role must hold at most one — that is the invariant
   * the whole workflow rests on.
   */
  it("gives no operational role both approve and hold", () => {
    const operational = [
      OrganizationRoles.WAREHOUSE,
      OrganizationRoles.FINANCE,
      OrganizationRoles.INVENTORY,
      OrganizationRoles.BASE,
      OrganizationRoles.SELF_SERVICE,
    ];

    for (const role of operational) {
      const both =
        canBooking(role, PermissionAction.approve) &&
        canBooking(role, PermissionAction.hold);
      expect(both, `${role} holds both approve and hold`).toBe(false);
    }
  });

  it("still lets admins do both", () => {
    for (const role of [OrganizationRoles.OWNER, OrganizationRoles.ADMIN]) {
      expect(canBooking(role, PermissionAction.approve)).toBe(true);
      expect(canBooking(role, PermissionAction.hold)).toBe(true);
    }
  });
});

describe("who can open the requests queue", () => {
  /**
   * Mirrors the derivation in the page loader and the sidebar: the queue is
   * visible to whoever can act on it, via either capability.
   */
  const canSeeQueue = (role: OrganizationRoles) =>
    canBooking(role, PermissionAction.approve) ||
    canBooking(role, PermissionAction.hold);

  it("is open to المستودعات، المخزون and admins", () => {
    for (const role of [
      OrganizationRoles.WAREHOUSE,
      OrganizationRoles.INVENTORY,
      OrganizationRoles.OWNER,
      OrganizationRoles.ADMIN,
    ]) {
      expect(canSeeQueue(role)).toBe(true);
    }
  });

  it("is closed to المالية and to employees", () => {
    for (const role of [
      OrganizationRoles.FINANCE,
      OrganizationRoles.BASE,
      OrganizationRoles.SELF_SERVICE,
    ]) {
      expect(canSeeQueue(role)).toBe(false);
    }
  });
});
