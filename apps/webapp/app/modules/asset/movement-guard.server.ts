/**
 * Refusing to erase items that someone has taken responsibility for.
 *
 * `Custody` and `CustodyHandoverAsset` are both `onDelete: Cascade` on
 * `assetId`. Deleting an asset therefore does two things nobody asked for:
 *
 * - it removes the custody row, so the register loses any trace of who was
 *   holding it, and
 * - **it removes a line out of a محضر two people signed**, leaving the
 *   signatures intact beside a shorter list.
 *
 * The second is the dangerous one. A signed document that lists fewer items
 * than were signed for is not detectably wrong from the inside — nothing
 * reports it, and it surfaces at the next inventory count, if ever. This
 * database was found holding six `COMPLETED` handovers with two signatures
 * each and **zero lines**, produced exactly this way.
 *
 * The guard already existed on the goods-receipt path. It did not exist on the
 * asset paths — `deleteAsset` and `bulkDeleteAssets` — which is where المخزون
 * actually delete things, so the register's own delete button was the hole.
 *
 * @see {@link file://./../goods-receipt/service.server.ts} `deleteGoodsReceipt`
 * @see {@link file://./../custody/handover.server.ts} what a محضر is
 */

import type { Prisma } from "@prisma/client";
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";

const label = "Assets" as const;

/** How many names to put in the message before it stops being readable. */
const MAX_NAMED = 10;

/**
 * Throws when any asset matching `scope` is in custody or named on a محضر.
 *
 * Takes a `where` fragment rather than a list of ids so every caller can ask
 * the question about its own selection — a receipt's lines, a purchase order's
 * whole output, or an explicit set of ids — while the *definition* of "has
 * moved" stays in one place.
 *
 * @param args.scope - Narrows which assets to test; always combined with
 *   `organizationId`, so a caller cannot accidentally reach across workspaces
 * @param args.organizationId - Workspace the assets must belong to
 * @param args.message - Builds the refusal text from the offending titles
 * @throws {ShelfError} 409 naming up to ten of the items that moved
 */
export async function assertAssetsHaveNotMoved({
  scope,
  organizationId,
  message,
}: {
  scope: Prisma.AssetWhereInput;
  organizationId: string;
  message: (names: string) => string;
}): Promise<void> {
  const moved = await db.asset.findMany({
    where: {
      ...scope,
      organizationId,
      // Deliberately custody **or** handover: an item can be named on a محضر
      // that has not been signed yet, and erasing it would still shorten the
      // document waiting for signatures.
      OR: [{ custody: { some: {} } }, { custodyHandovers: { some: {} } }],
    },
    select: { title: true },
    take: MAX_NAMED,
  });

  if (moved.length === 0) return;

  throw new ShelfError({
    cause: null,
    title: "أصناف تحرّكت",
    message: message(moved.map((asset) => asset.title).join("، ")),
    additionalData: { organizationId, movedCount: moved.length },
    label,
    status: 409,
    shouldBeCaptured: false,
  });
}

/**
 * The refusal wording for erasing items directly from the register.
 *
 * Says what to do next, because "cannot delete" on its own leaves the operator
 * with a row they believe should be gone and no route to it.
 */
export function assetsMovedMessage(names: string): string {
  return `لا يمكن حذف هذه الأصناف: بعضها في عهدة أو مذكور في محضر تسليم (${names}). الحذف يمحو سطر الصنف من محضر موقَّع بصمت، فيبقى المحضر بتواقيعه ناقصاً. فُكّ العهدة وأبطِل المحاضر أولاً.`;
}
