/**
 * "Assets in my custody" (الأصناف التي في عهدتي)
 *
 * Answers one question for the signed-in employee: *what am I currently
 * holding, and what am I accountable for?*
 *
 * Two different things satisfy that, and the page keeps them apart because the
 * obligations differ:
 *
 * 1. **Custody** (عهدة) — an operator handed the asset over. It stays with the
 *    employee until someone releases it; there is no end date.
 * 2. **Checked out on a booking** (مصروف بحجز) — the employee has it for a
 *    fixed window and is expected to return it. Overdue is a real state here.
 *
 * Merging the two into one list would hide that difference, and the difference
 * is the whole point: one has a due date, the other does not.
 *
 * @see {@link file://./../../routes/_layout+/my-custody.tsx}
 */

import type { OrganizationRoles } from "@prisma/client";
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import { resolveDepartmentDeskId } from "~/utils/permissions/role-scope";

const label = "Assets" as const;

/** Asset fields the custody page renders. */
const MY_CUSTODY_ASSET_SELECT = {
  id: true,
  title: true,
  sequentialId: true,
  status: true,
  mainImage: true,
  thumbnailImage: true,
  mainImageExpiration: true,
  type: true,
  unitOfMeasure: true,
  category: { select: { id: true, name: true, color: true } },
} as const;

/** One row of the "handed to me" list. */
export type MyCustodyItem = Awaited<
  ReturnType<typeof getMyCustodyAndCheckouts>
>["custodies"][number];

/**
 * Loads everything the signed-in user is currently holding.
 *
 * Scoped by `userId` on the custodian's linked user account rather than by
 * team-member id: a person can have more than one `TeamMember` row across
 * workspaces, and the organization filter already pins this to one workspace.
 *
 * Deliberately **not** filtered by intake stage. Every other read path hides
 * `PENDING` assets from employees, because that gate exists to stop them
 * browsing and booking inventory the warehouse has not released. An asset
 * physically handed to someone is the opposite situation — hiding it would
 * leave them accountable for something they cannot see.
 *
 * ## Two lists, deliberately separate
 *
 * A `DEPARTMENT` officer holds nothing personally — the batch they signed for
 * sits on their department's desk row, which has no user account. Merging the
 * two would make it read as "you are personally accountable for 80 laptops".
 * They are listed apart so the page can say which is which, and so the desk's
 * stock is what the officer hands on to their staff.
 *
 * @param organizationId - Workspace to read within
 * @param userId - The signed-in user
 * @param roles - The user's roles, used to decide whether the department's
 *   desk is visible to them at all
 * @param departmentTeamMemberId - The desk they work for, if any
 * @returns Assets held personally, and assets held by their department
 * @throws {ShelfError} If either query fails
 */
export async function getMyCustodyAndCheckouts({
  organizationId,
  userId,
  roles,
  departmentTeamMemberId,
}: {
  organizationId: string;
  userId: string;
  roles?: OrganizationRoles[];
  departmentTeamMemberId?: string | null;
}) {
  try {
    /**
     * The desk this viewer speaks for, or `null`.
     *
     * `resolveDepartmentDeskId` is the single place that decides — it refuses
     * to hand the desk to someone who merely *belongs* to a department without
     * holding the role. Deliberately NOT derived from visibility: `OWNER` sees
     * everything and so is never "filtered", which would have hidden the IT
     * desk from the very account that speaks for it.
     */
    const deskId = resolveDepartmentDeskId({ roles, departmentTeamMemberId });

    const [custodies, departmentCustodies] = await Promise.all([
      db.custody.findMany({
        where: {
          custodian: { userId, organizationId },
          asset: { organizationId },
        },
        select: {
          id: true,
          quantity: true,
          createdAt: true,
          /**
           * Non-null when this row was inherited from a kit-level custody, so
           * the UI can say "via kit" instead of implying it was handed over
           * asset by asset.
           */
          kitCustody: {
            select: { id: true, kit: { select: { id: true, name: true } } },
          },
          asset: { select: MY_CUSTODY_ASSET_SELECT },
        },
        orderBy: { createdAt: "desc" },
      }),

      // Skipped entirely for everyone who is not a department officer — an
      // empty `where` here would return the whole workspace's custody.
      deskId
        ? db.custody.findMany({
            where: {
              teamMemberId: deskId,
              asset: { organizationId },
            },
            select: {
              id: true,
              quantity: true,
              createdAt: true,
              kitCustody: {
                select: { id: true, kit: { select: { id: true, name: true } } },
              },
              asset: { select: MY_CUSTODY_ASSET_SELECT },
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    return { custodies, departmentCustodies };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while fetching the assets you hold.",
      additionalData: { organizationId, userId },
      label,
    });
  }
}
