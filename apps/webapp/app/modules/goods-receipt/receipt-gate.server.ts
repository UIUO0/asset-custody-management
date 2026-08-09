/**
 * The signature gate that stands between a received item and circulation.
 *
 * Deliberately its own module rather than part of `service.server.ts`.
 * The receipt service imports `createAsset` from the asset service, and the
 * asset service needs this gate — putting the gate next to the service would
 * make those two modules import each other. A cycle through
 * `asset/service.server.ts` is not a theoretical concern in this codebase: that
 * file is imported by well over a hundred routes, and a cycle involving it
 * produces `undefined` exports at runtime rather than a build error.
 *
 * This module imports nothing but the database client and the error helper, so
 * it can be pulled in from anywhere without dragging a graph behind it.
 *
 * @see {@link file://./service.server.ts} the rest of the receipt flow
 * @see {@link file://./../asset/service.server.ts} `bulkApproveAssets`, the caller
 */

import { GoodsReceiptState } from "@prisma/client";
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";

const label = "Assets" as const;

/**
 * Refuses approval of an item whose receipt is not fully signed.
 *
 * This is where the three signatures actually bite. Data entry is never blocked
 * — the items exist from the moment the form is saved — but an item cannot
 * leave `PENDING` for `READY` until every party has signed the document that
 * admitted it. Approving otherwise would put stock into circulation on the
 * strength of a form nobody has agreed to.
 *
 * Items with no receipt line pass unaffected. Those were created before this
 * flow existed or imported by an admin; they were never covered by the rule,
 * and applying it retroactively would freeze the existing inventory of every
 * deployment that upgrades.
 *
 * Throws rather than filtering the blocked items out. An operator who selected
 * twenty assets and silently got eighteen approved has no way to find out which
 * two were skipped, or why.
 *
 * @param args.assetIds - Items about to be approved
 * @param args.organizationId - Workspace, applied to every lookup
 * @throws {ShelfError} 400 naming the receipts still awaiting signatures
 */
export async function assertReceiptSignedBeforeApproval({
  assetIds,
  organizationId,
}: {
  assetIds: string[];
  organizationId: string;
}): Promise<void> {
  if (assetIds.length === 0) return;

  const blocked = await db.asset.findMany({
    where: {
      id: { in: assetIds },
      organizationId,
      // Only items that came through a receipt, and only where that receipt has
      // not reached SIGNED. VOIDED is excluded on purpose: a voided receipt is
      // a separate problem, and blocking approval on it would leave stock that
      // physically arrived permanently unusable.
      receiptLine: {
        receipt: {
          state: { in: [GoodsReceiptState.DRAFT, GoodsReceiptState.SAVED] },
        },
      },
    },
    select: {
      id: true,
      receiptLine: { select: { receipt: { select: { reference: true } } } },
    },
  });

  if (blocked.length === 0) return;

  const references = [
    ...new Set(
      blocked
        .map((asset) => asset.receiptLine?.receipt.reference)
        .filter((reference): reference is string => Boolean(reference)),
    ),
  ];

  throw new ShelfError({
    cause: null,
    title: "النموذج غير موقّع",
    message: `لا يمكن اعتماد أصناف من نموذج استلام لم تكتمل تواقيعه: ${references.join(
      "، ",
    )}. أكمل التواقيع الثلاثة أولاً.`,
    additionalData: {
      organizationId,
      references,
      blockedCount: blocked.length,
    },
    label,
    status: 400,
    shouldBeCaptured: false,
  });
}
