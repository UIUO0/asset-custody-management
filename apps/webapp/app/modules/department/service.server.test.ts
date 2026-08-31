/**
 * Department desks.
 *
 * The properties worth pinning are the ones whose failure is *silent*. A
 * department that is half-wired shows no error anywhere: the user simply sees
 * an empty page where their department's stock should be, and a محضر addressed
 * to their desk that they cannot sign. So these tests assert on the pairing of
 * role and pointer, and on the two ways a desk row can be the wrong row.
 *
 * @see {@link file://./service.server.ts}
 */

import { OrganizationRoles } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// why: the service is pure database orchestration — Postgres is not available
// in the unit-test environment and is not the behaviour under test.
vi.mock("~/database/db.server", () => ({
  db: {
    teamMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    userOrganization: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const { db } = await import("~/database/db.server");
const {
  createDepartmentDesk,
  getDepartmentDesks,
  linkUserToDepartment,
  unlinkUserFromDepartment,
} = await import("./service.server");

/** The mocked delegates, typed loosely — the fake only implements what is used. */
const mocked = db as unknown as {
  teamMember: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  userOrganization: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDepartmentDesks", () => {
  it("counts only the members who hold the role as representatives", async () => {
    // The pointer alone is not representation: `resolveDepartmentDeskId`
    // refuses the desk to somebody who merely belongs to a department, so
    // listing them here would promise an authority they do not have.
    mocked.teamMember.findMany.mockResolvedValue([
      {
        id: "desk-1",
        name: "إدارة المرافق",
        _count: { custodies: 12 },
        departmentMembers: [
          {
            userId: "u-rep",
            roles: [OrganizationRoles.DEPARTMENT],
            user: {
              id: "u-rep",
              email: "rep@example.local",
              firstName: "سعد",
              lastName: null,
            },
          },
          {
            userId: "u-bystander",
            roles: [OrganizationRoles.BASE],
            user: {
              id: "u-bystander",
              email: "someone@example.local",
              firstName: null,
              lastName: null,
            },
          },
        ],
      },
    ]);

    const [desk] = await getDepartmentDesks({ organizationId: "org-1" });

    expect(desk.representatives).toEqual([
      { userId: "u-rep", name: "سعد", email: "rep@example.local" },
    ]);
    expect(desk.custodyCount).toBe(12);
  });

  it("falls back to the email when the account has no name", async () => {
    mocked.teamMember.findMany.mockResolvedValue([
      {
        id: "desk-1",
        name: "إدارة تقنية المعلومات",
        _count: { custodies: 0 },
        departmentMembers: [
          {
            userId: "u-1",
            roles: [OrganizationRoles.OWNER, OrganizationRoles.DEPARTMENT],
            user: {
              id: "u-1",
              email: "admin@example.local",
              firstName: null,
              lastName: null,
            },
          },
        ],
      },
    ]);

    const [desk] = await getDepartmentDesks({ organizationId: "org-1" });

    expect(desk.representatives[0].name).toBe("admin@example.local");
  });
});

describe("createDepartmentDesk", () => {
  it("creates a desk row rather than a person", async () => {
    mocked.teamMember.findFirst.mockResolvedValue(null);
    mocked.teamMember.create.mockResolvedValue({
      id: "desk-1",
      name: "إدارة المرافق",
    });

    await createDepartmentDesk({
      organizationId: "org-1",
      name: "  إدارة المرافق  ",
    });

    expect(mocked.teamMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: "org-1",
          name: "إدارة المرافق",
          isDepartment: true,
        },
      }),
    );
  });

  it("refuses a duplicate name", async () => {
    // Two desks for one department means its custody is split across two rows
    // that do not know about each other.
    mocked.teamMember.findFirst.mockResolvedValue({ id: "desk-existing" });

    await expect(
      createDepartmentDesk({ organizationId: "org-1", name: "إدارة المرافق" }),
    ).rejects.toThrow(/بالفعل/);

    expect(mocked.teamMember.create).not.toHaveBeenCalled();
  });
});

describe("linkUserToDepartment", () => {
  it("writes the role and the pointer in one update", async () => {
    // Either alone is a silent no-op — see the module docblock.
    mocked.teamMember.findFirst.mockResolvedValue({ id: "desk-1" });
    mocked.userOrganization.findFirst.mockResolvedValue({
      roles: [OrganizationRoles.BASE],
    });

    await linkUserToDepartment({
      userId: "u-1",
      organizationId: "org-1",
      teamMemberId: "desk-1",
    });

    expect(mocked.userOrganization.update).toHaveBeenCalledWith({
      where: {
        userId_organizationId: { userId: "u-1", organizationId: "org-1" },
      },
      data: {
        roles: { set: [OrganizationRoles.BASE, OrganizationRoles.DEPARTMENT] },
        departmentTeamMemberId: "desk-1",
      },
    });
  });

  it("keeps the roles the account already holds", async () => {
    // `admin@example.local` is `[OWNER, DEPARTMENT]`: they administer the system
    // and receive their own office's batches. Replacing the array would strip
    // the workspace owner.
    mocked.teamMember.findFirst.mockResolvedValue({ id: "desk-1" });
    mocked.userOrganization.findFirst.mockResolvedValue({
      roles: [OrganizationRoles.OWNER],
    });

    await linkUserToDepartment({
      userId: "u-1",
      organizationId: "org-1",
      teamMemberId: "desk-1",
    });

    expect(
      mocked.userOrganization.update.mock.calls[0][0].data.roles.set,
    ).toEqual([OrganizationRoles.OWNER, OrganizationRoles.DEPARTMENT]);
  });

  it("does not add the role twice", async () => {
    mocked.teamMember.findFirst.mockResolvedValue({ id: "desk-2" });
    mocked.userOrganization.findFirst.mockResolvedValue({
      roles: [OrganizationRoles.DEPARTMENT],
    });

    await linkUserToDepartment({
      userId: "u-1",
      organizationId: "org-1",
      teamMemberId: "desk-2",
    });

    expect(
      mocked.userOrganization.update.mock.calls[0][0].data.roles.set,
    ).toEqual([OrganizationRoles.DEPARTMENT]);
  });

  it("refuses a team-member id that is a person, not a desk", async () => {
    // The lookup is scoped by `isDepartment`, so a crafted id naming an
    // employee's row finds nothing rather than handing their custody away.
    mocked.teamMember.findFirst.mockResolvedValue(null);

    await expect(
      linkUserToDepartment({
        userId: "u-1",
        organizationId: "org-1",
        teamMemberId: "tm-person",
      }),
    ).rejects.toThrow(/لا توجد إدارة/);

    expect(mocked.userOrganization.update).not.toHaveBeenCalled();
  });

  it("refuses a user who is not a member of the workspace", async () => {
    mocked.teamMember.findFirst.mockResolvedValue({ id: "desk-1" });
    mocked.userOrganization.findFirst.mockResolvedValue(null);

    await expect(
      linkUserToDepartment({
        userId: "outsider",
        organizationId: "org-1",
        teamMemberId: "desk-1",
      }),
    ).rejects.toThrow(/ليس عضواً/);

    expect(mocked.userOrganization.update).not.toHaveBeenCalled();
  });
});

describe("unlinkUserFromDepartment", () => {
  it("drops the role and the pointer together, keeping the rest", async () => {
    mocked.userOrganization.findFirst.mockResolvedValue({
      roles: [OrganizationRoles.OWNER, OrganizationRoles.DEPARTMENT],
    });

    await unlinkUserFromDepartment({ userId: "u-1", organizationId: "org-1" });

    expect(mocked.userOrganization.update).toHaveBeenCalledWith({
      where: {
        userId_organizationId: { userId: "u-1", organizationId: "org-1" },
      },
      data: {
        roles: { set: [OrganizationRoles.OWNER] },
        departmentTeamMemberId: null,
      },
    });
  });

  it("does nothing for a non-member", async () => {
    mocked.userOrganization.findFirst.mockResolvedValue(null);

    await unlinkUserFromDepartment({ userId: "u-1", organizationId: "org-1" });

    expect(mocked.userOrganization.update).not.toHaveBeenCalled();
  });
});
