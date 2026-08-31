import { OrganizationRoles } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isDemotion } from "./roles";

describe("isDemotion", () => {
  it("returns true when ADMIN is changed to BASE", () => {
    expect(isDemotion(OrganizationRoles.ADMIN, OrganizationRoles.BASE)).toBe(
      true,
    );
  });

  it("returns true when ADMIN is changed to SELF_SERVICE", () => {
    expect(
      isDemotion(OrganizationRoles.ADMIN, OrganizationRoles.SELF_SERVICE),
    ).toBe(true);
  });

  it("returns false when SELF_SERVICE is changed to BASE (same rank)", () => {
    expect(
      isDemotion(OrganizationRoles.SELF_SERVICE, OrganizationRoles.BASE),
    ).toBe(false);
  });

  it("returns false when BASE is changed to SELF_SERVICE (same rank)", () => {
    expect(
      isDemotion(OrganizationRoles.BASE, OrganizationRoles.SELF_SERVICE),
    ).toBe(false);
  });

  it("returns false when BASE is promoted to ADMIN", () => {
    expect(isDemotion(OrganizationRoles.BASE, OrganizationRoles.ADMIN)).toBe(
      false,
    );
  });

  it("returns false when SELF_SERVICE is promoted to ADMIN", () => {
    expect(
      isDemotion(OrganizationRoles.SELF_SERVICE, OrganizationRoles.ADMIN),
    ).toBe(false);
  });

  it("returns false when role is unchanged", () => {
    expect(isDemotion(OrganizationRoles.ADMIN, OrganizationRoles.ADMIN)).toBe(
      false,
    );
    expect(isDemotion(OrganizationRoles.BASE, OrganizationRoles.BASE)).toBe(
      false,
    );
  });

  it("returns true when OWNER is changed to any lower role", () => {
    expect(isDemotion(OrganizationRoles.OWNER, OrganizationRoles.ADMIN)).toBe(
      true,
    );
    expect(isDemotion(OrganizationRoles.OWNER, OrganizationRoles.BASE)).toBe(
      true,
    );
  });

  /**
   * A demotion reassigns every asset, booking and kit the user owns, so
   * misranking a role is destructive rather than merely wrong. The ORG
   * operational roles keep organization-wide visibility, which is what the
   * ranks encode — moving between them must therefore be lateral.
   */
  const orgRoles = [
    OrganizationRoles.WAREHOUSE,
    OrganizationRoles.FINANCE,
    OrganizationRoles.INVENTORY,
  ];

  it("treats ADMIN ↔ the ORG operational roles as lateral, not a demotion", () => {
    for (const role of orgRoles) {
      expect(isDemotion(OrganizationRoles.ADMIN, role)).toBe(false);
      expect(isDemotion(role, OrganizationRoles.ADMIN)).toBe(false);
    }
  });

  it("treats moves between the ORG operational roles as lateral", () => {
    expect(
      isDemotion(OrganizationRoles.WAREHOUSE, OrganizationRoles.FINANCE),
    ).toBe(false);
    expect(
      isDemotion(OrganizationRoles.INVENTORY, OrganizationRoles.WAREHOUSE),
    ).toBe(false);
  });

  it("treats dropping an ORG role to BASE or SELF_SERVICE as a demotion", () => {
    for (const role of orgRoles) {
      expect(isDemotion(role, OrganizationRoles.BASE)).toBe(true);
      expect(isDemotion(role, OrganizationRoles.SELF_SERVICE)).toBe(true);
    }
  });

  it("treats OWNER → any ORG role as a demotion", () => {
    for (const role of orgRoles) {
      expect(isDemotion(OrganizationRoles.OWNER, role)).toBe(true);
    }
  });

  it("treats promotion from BASE to an ORG role as not a demotion", () => {
    for (const role of orgRoles) {
      expect(isDemotion(OrganizationRoles.BASE, role)).toBe(false);
    }
  });
});
