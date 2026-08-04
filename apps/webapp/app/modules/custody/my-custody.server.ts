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

import { BookingStatus } from "@prisma/client";
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";

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

/** One row of the "checked out to me" list. */
export type MyCheckedOutItem = Awaited<
  ReturnType<typeof getMyCustodyAndCheckouts>
>["checkedOut"][number];

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
 * @param organizationId - Workspace to read within
 * @param userId - The signed-in user
 * @returns Assets held on custody, and assets checked out on an active booking
 * @throws {ShelfError} If either query fails
 */
export async function getMyCustodyAndCheckouts({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  try {
    const [custodies, bookingAssets] = await Promise.all([
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

      db.bookingAsset.findMany({
        where: {
          asset: { organizationId },
          booking: {
            organizationId,
            // Only what is physically out: RESERVED has not been handed over
            // yet, COMPLETE has come back.
            status: { in: [BookingStatus.ONGOING, BookingStatus.OVERDUE] },
            custodianUser: { id: userId },
          },
        },
        select: {
          id: true,
          quantity: true,
          asset: { select: MY_CUSTODY_ASSET_SELECT },
          booking: {
            select: {
              id: true,
              name: true,
              from: true,
              to: true,
              status: true,
            },
          },
        },
        orderBy: { booking: { to: "asc" } },
      }),
    ]);

    return { custodies, checkedOut: bookingAssets };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while fetching the assets you hold.",
      additionalData: { organizationId, userId },
      label,
    });
  }
}
