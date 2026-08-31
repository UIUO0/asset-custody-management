/**
 * Department desks (مكاتب الإدارات) — creating them and saying who speaks for
 * them.
 *
 * ## What a department is, mechanically
 *
 * Three separate pieces, and keeping them separate is what makes a new
 * department a row rather than a migration:
 *
 * | Piece                                     | Answers                        |
 * | ----------------------------------------- | ------------------------------ |
 * | `TeamMember.isDepartment`                 | "this row is a desk, not a person" |
 * | `OrganizationRoles.DEPARTMENT`            | "may act as a department"      |
 * | `UserOrganization.departmentTeamMemberId` | "which department"             |
 *
 * A desk is a `TeamMember` with no `userId` — custody is already
 * `TeamMember`-scoped and `userId` is optional there, so the warehouse hands a
 * batch to the desk and the desk hands single items to its staff through the
 * one `CustodyHandover` path.
 *
 * ## Why this module exists
 *
 * All three pieces were writable only by `scripts/seed-demo-users.ts`. Onboarding
 * a third receiving department meant editing the database by hand — while
 * `CLAUDE.md` described departments as "data, not code". They were data with no
 * screen, which is the same as code for anybody who is not holding a psql
 * prompt.
 *
 * ## The pairing rule
 *
 * The role and the pointer are written **together**, always. Either alone is a
 * silent no-op that looks like it worked:
 *
 * - Role without pointer → `resolveDepartmentDeskId` returns `null`, so the
 *   user sees no department stock and can sign nothing on the desk's behalf.
 * - Pointer without role → the same, deliberately: belonging to a department
 *   must not by itself confer the desk's authority.
 *
 * Neither shows an error anywhere. Writing them in one update is the only way
 * the screen can promise what it appears to promise.
 *
 * @see {@link file://./../../utils/permissions/role-scope.ts} — how the three
 *   pieces are read back
 * @see {@link file://./../../routes/_layout+/settings.team.departments.tsx}
 */

import type { Organization, TeamMember, User } from "@prisma/client";
import { OrganizationRoles } from "@prisma/client";
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";

const label = "Team" as const;

/** A desk, with the accounts that speak for it. */
export type DepartmentDesk = {
  id: string;
  name: string;
  /** Accounts holding `DEPARTMENT` and pointed at this desk. */
  representatives: Array<{
    userId: string;
    name: string;
    email: string;
  }>;
  /** Distinct assets currently in the desk's custody. */
  custodyCount: number;
};

/**
 * Every department desk in the workspace, with who represents it.
 *
 * @param organizationId - Workspace to read within
 * @returns Desks ordered by name
 * @throws {ShelfError} If the read fails
 */
export async function getDepartmentDesks({
  organizationId,
}: {
  organizationId: Organization["id"];
}): Promise<DepartmentDesk[]> {
  try {
    const desks = await db.teamMember.findMany({
      where: { organizationId, isDepartment: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { custodies: true } },
        departmentMembers: {
          select: {
            userId: true,
            roles: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return desks.map((desk) => ({
      id: desk.id,
      name: desk.name,
      custodyCount: desk._count.custodies,
      representatives: desk.departmentMembers
        // The pointer alone is not representation — the role is what grants the
        // desk's authority, and this list must show who actually has it rather
        // than who merely has a column filled in.
        .filter((membership) =>
          membership.roles.includes(OrganizationRoles.DEPARTMENT),
        )
        .map((membership) => ({
          userId: membership.userId,
          email: membership.user.email,
          name:
            [membership.user.firstName, membership.user.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || membership.user.email,
        })),
    }));
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "تعذّر قراءة قائمة الإدارات. حاول مرة أخرى.",
      additionalData: { organizationId },
      label,
    });
  }
}

/**
 * Creates a department desk.
 *
 * A `TeamMember` with no `userId` and `isDepartment: true` — see the module
 * docblock for why departments are team members.
 *
 * @param organizationId - Workspace the desk belongs to
 * @param name - Department name as it should print on a محضر
 * @returns The created desk
 * @throws {ShelfError} 409 when a desk of that name already exists, so two rows
 *   cannot compete for the same department's stock
 */
export async function createDepartmentDesk({
  organizationId,
  name,
}: {
  organizationId: Organization["id"];
  name: string;
}): Promise<Pick<TeamMember, "id" | "name">> {
  const trimmed = name.trim();

  try {
    const existing = await db.teamMember.findFirst({
      where: {
        organizationId,
        isDepartment: true,
        deletedAt: null,
        name: { equals: trimmed, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ShelfError({
        cause: null,
        title: "الإدارة موجودة",
        message: `توجد إدارة باسم «${trimmed}» بالفعل. إدارتان بالاسم نفسه تعنيان عهدةً موزّعة على صفّين لا يعرف أحدهما الآخر.`,
        additionalData: { organizationId, name: trimmed },
        label,
        status: 409,
        shouldBeCaptured: false,
      });
    }

    return await db.teamMember.create({
      data: { organizationId, name: trimmed, isDepartment: true },
      select: { id: true, name: true },
    });
  } catch (cause) {
    if (cause instanceof ShelfError) throw cause;

    throw new ShelfError({
      cause,
      message: "تعذّر إنشاء الإدارة. حاول مرة أخرى.",
      additionalData: { organizationId, name: trimmed },
      label,
    });
  }
}

/**
 * Makes a user speak for a department desk — role and pointer in one write.
 *
 * Adds `DEPARTMENT` to the membership's roles rather than replacing them: the
 * seeded admin holds `[OWNER, DEPARTMENT]` because they administer the system
 * *and* receive their own office's batches, and that combination has to remain
 * expressible. See {@link preservedRoles} for the mirror of this on the way out.
 *
 * @param userId - The account
 * @param organizationId - Workspace
 * @param teamMemberId - The desk they will represent
 * @throws {ShelfError} 404 when the membership or the desk is not in this
 *   workspace
 */
export async function linkUserToDepartment({
  userId,
  organizationId,
  teamMemberId,
}: {
  userId: User["id"];
  organizationId: Organization["id"];
  teamMemberId: TeamMember["id"];
}): Promise<void> {
  try {
    // Scoped to the workspace *and* to `isDepartment` — a caller-supplied id
    // that names a person's row would otherwise hand an employee's custody to
    // somebody as if it were a department's.
    const desk = await db.teamMember.findFirst({
      where: {
        id: teamMemberId,
        organizationId,
        isDepartment: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!desk) {
      throw new ShelfError({
        cause: null,
        title: "الإدارة غير موجودة",
        message: "لا توجد إدارة بهذا المعرّف في مساحة العمل.",
        additionalData: { organizationId, teamMemberId },
        label,
        status: 404,
        shouldBeCaptured: false,
      });
    }

    const membership = await db.userOrganization.findFirst({
      where: { userId, organizationId },
      select: { roles: true },
    });

    if (!membership) {
      throw new ShelfError({
        cause: null,
        title: "المستخدم ليس عضواً",
        message: "هذا المستخدم ليس عضواً في مساحة العمل.",
        additionalData: { organizationId, userId },
        label,
        status: 404,
        shouldBeCaptured: false,
      });
    }

    const roles = membership.roles.includes(OrganizationRoles.DEPARTMENT)
      ? membership.roles
      : [...membership.roles, OrganizationRoles.DEPARTMENT];

    // One update: a role without a pointer (or the reverse) is a silent no-op
    // that reads on screen as if it had worked.
    await db.userOrganization.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { roles: { set: roles }, departmentTeamMemberId: teamMemberId },
    });
  } catch (cause) {
    if (cause instanceof ShelfError) throw cause;

    throw new ShelfError({
      cause,
      message: "تعذّر ربط المستخدم بالإدارة. حاول مرة أخرى.",
      additionalData: { organizationId, userId, teamMemberId },
      label,
    });
  }
}

/**
 * Removes a user's department authority — role and pointer together.
 *
 * The desk itself is untouched: its custody is the department's, not the
 * representative's, and a handover addressed to it stays addressed to it. What
 * this ends is one person's ability to act for it.
 *
 * ⚠️ Removing the *last* representative leaves the desk with open محاضر nobody
 * can sign. The screen warns; this function does not refuse, because an
 * authority that cannot revoke someone's access until it has found a
 * replacement is worse than one that can.
 *
 * @param userId - The account
 * @param organizationId - Workspace
 * @throws {ShelfError} If the write fails
 */
export async function unlinkUserFromDepartment({
  userId,
  organizationId,
}: {
  userId: User["id"];
  organizationId: Organization["id"];
}): Promise<void> {
  try {
    const membership = await db.userOrganization.findFirst({
      where: { userId, organizationId },
      select: { roles: true },
    });

    if (!membership) return;

    await db.userOrganization.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: {
        roles: {
          set: membership.roles.filter(
            (role) => role !== OrganizationRoles.DEPARTMENT,
          ),
        },
        departmentTeamMemberId: null,
      },
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "تعذّر فكّ ربط المستخدم بالإدارة. حاول مرة أخرى.",
      additionalData: { organizationId, userId },
      label,
    });
  }
}
