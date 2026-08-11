/**
 * The approval effect — moving items from قيد الانتظار to جاهز للتوزيع.
 *
 * One body, three doors: the asset index's bulk action, the single-asset page,
 * and the purchase-order screen's "اعتماد وإتاحة أصناف الأمر". They must not be
 * able to produce different assets from the same act, and they nearly did — the
 * bulk path and the single path each carried their own copy of "set the stage
 * *and* open it for booking", with a comment on each begging the other to stay
 * in step.
 *
 * ## Its own module, not part of `asset/service.server.ts`
 *
 * Same reason as {@link file://./../goods-receipt/receipt-gate.server.ts}: the
 * purchase-order service needs to call this, and reaching it through the asset
 * service would make a module imported by a hundred routes a dependency of the
 * receipt layer that the asset service itself imports. A cycle through that file
 * does not fail the build — it yields `undefined` exports at runtime.
 *
 * This module imports the database client, the signature gate and the note
 * writer, and nothing else.
 *
 * @see {@link file://./service.server.ts} — `bulkApproveAssets`, the index door
 * @see {@link file://./../goods-receipt/purchase-order.server.ts} — the order door
 */

import { AssetLifecycleStage } from "@prisma/client";
import { db } from "~/database/db.server";
import { assertReceiptSignedBeforeApproval } from "~/modules/goods-receipt/receipt-gate.server";
import { createNotes } from "~/modules/note/service.server";
import { ShelfError } from "~/utils/error";
import { wrapUserLinkForNote } from "~/utils/markdoc-wrappers";

const label = "Assets" as const;

/**
 * Approves every `PENDING` asset among the given ids.
 *
 * ## What approval *is*
 *
 * Two writes in one act: the item enters circulation (`READY`) and becomes
 * bookable. They answer different questions — the stage is the intake gate,
 * `availableToBook` governs bookings alone — but leaving them independent let an
 * approved asset sit in circulation with booking silently off. Coupling them
 * makes the toggle afterwards the *exception* (a printer bolted to a desk),
 * not a second switch somebody has to remember.
 *
 * ## Already-approved ids are skipped, not rejected
 *
 * Callers arrive with a selection, and a selection routinely contains items
 * somebody else approved a minute ago. Failing the batch for that would make
 * the button unusable on any busy order; the return count says what actually
 * moved.
 *
 * The **receipt signature gate** is the opposite: it throws rather than
 * filtering, because an operator who selected twenty items and silently got
 * eighteen has no way to discover which two were skipped, or why.
 *
 * @param args.assetIds - Candidates. Already-`READY` ids are ignored.
 * @param args.organizationId - Workspace, applied to every read and write
 * @param args.userId - Who approved, recorded in the per-asset note
 * @returns How many assets actually moved
 * @throws {ShelfError} 400 when an item's goods receipt is not fully signed
 */
export async function approveAssetsByIds({
  assetIds,
  organizationId,
  userId,
}: {
  assetIds: string[];
  organizationId: string;
  userId: string;
}): Promise<number> {
  if (assetIds.length === 0) return 0;

  try {
    // Read the pending subset first: `updateMany` returns only a count, and one
    // note per asset that actually moved needs the exact ids.
    const pendingAssets = await db.asset.findMany({
      where: {
        id: { in: assetIds },
        organizationId,
        lifecycleStage: AssetLifecycleStage.PENDING,
      },
      select: { id: true },
    });

    if (pendingAssets.length === 0) return 0;

    const pendingIds = pendingAssets.map((asset) => asset.id);

    /**
     * EPDA: an item admitted by a goods receipt cannot be released into
     * circulation until all three parties have signed the document that
     * admitted it.
     *
     * Enforced here rather than in any route, because this is the single
     * chokepoint every approval passes through. Items with no receipt line
     * (created before the receipt flow, or imported) are unaffected — they were
     * never covered by the rule, and applying it retroactively would freeze the
     * existing inventory of every deployment that upgrades.
     */
    await assertReceiptSignedBeforeApproval({
      assetIds: pendingIds,
      organizationId,
    });

    await db.asset.updateMany({
      where: {
        id: { in: pendingIds },
        organizationId,
        lifecycleStage: AssetLifecycleStage.PENDING,
      },
      data: {
        lifecycleStage: AssetLifecycleStage.READY,
        availableToBook: true,
      },
    });

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, displayName: true, firstName: true, lastName: true },
    });

    // The note names the side effect explicitly: `availableToBook` flips without
    // anybody touching its switch, so the asset's own history has to explain why
    // it changed.
    await createNotes({
      content: `${wrapUserLinkForNote(
        user,
      )} marked this asset as **ready for distribution** and made it available to book.`,
      type: "UPDATE",
      userId,
      assetIds: pendingIds,
      organizationId,
    });

    return pendingIds.length;
  } catch (cause) {
    if (cause instanceof ShelfError) throw cause;

    throw new ShelfError({
      cause,
      message: "Something went wrong while approving the selected assets.",
      additionalData: { assetIds, organizationId },
      label,
    });
  }
}
