/**
 * The two work queues the intake workflow hands between roles.
 *
 * Coding and approval are a relay: المالية put a رقم ترميز on each أصل, and only
 * then can المستودعات release the delivery into circulation. Neither side has a
 * way to know the baton has been passed — المالية would have to open every
 * purchase order to find uncoded items, and المستودعات would have to poll the
 * same screens waiting for codes to appear. In practice that means a delivery
 * sits finished-but-unreleased until somebody thinks to look.
 *
 * These two counts are what the sidebar badges render, so each side sees its
 * own backlog without going looking for it.
 *
 * ## Scoped to live receipts, like every other count on this workflow
 *
 * A cancelled receipt is out of the order's totals, out of المالية's coding
 * queue and out of the approval gate. Counting its items in a badge would send
 * somebody hunting for work that was called off.
 *
 * @see {@link file://./../goods-receipt/purchase-order.server.ts} `getOrderApprovalState`,
 *   the per-order form of the same rule
 * @see {@link file://./../../hooks/use-sidebar-nav-items.tsx} the badges
 */

import { AssetLifecycleStage, type Prisma } from "@prisma/client";
import { db } from "~/database/db.server";
import { ItemClassValue, ReceiptState } from "~/modules/goods-receipt/enums";

/** The backlog each side of the relay is carrying. */
export type AssetActionQueue = {
  /** أصول admitted on a live receipt that still have no رقم ترميز. */
  awaitingFinanceCode: number;
  /** Items already coded and still waiting for المستودعات to approve them. */
  awaitingApproval: number;
};

/**
 * Counts both queues, skipping whichever the viewer cannot act on.
 *
 * The caller passes what the viewer *may do* rather than their role, because
 * this runs in the root layout loader on **every authenticated page load** — an
 * employee who can neither code nor approve must not pay for two counts that
 * will never be shown to them.
 *
 * @param args.organizationId - Workspace, applied to every read
 * @param args.canCode - Whether to compute the coding backlog
 * @param args.canApprove - Whether to compute the approval backlog
 * @returns Both counts; a skipped queue is `0`
 */
export async function getAssetActionQueue({
  organizationId,
  canCode,
  canApprove,
}: {
  organizationId: string;
  canCode: boolean;
  canApprove: boolean;
}): Promise<AssetActionQueue> {
  if (!canCode && !canApprove) {
    return { awaitingFinanceCode: 0, awaitingApproval: 0 };
  }

  /** Items admitted by a receipt that was not cancelled. */
  const liveReceipt: Prisma.AssetWhereInput["receiptLine"] = {
    receipt: { organizationId, state: { not: ReceiptState.VOIDED } },
  };

  /**
   * `null` and `""` both mean uncoded.
   *
   * Clearing a code writes an empty string rather than null (see
   * `setAssetFinanceCode`), so a check for null alone would read a cleared code
   * as a present one and quietly shrink the queue.
   */
  const uncoded: Prisma.AssetWhereInput["OR"] = [
    { financeCode: null },
    { financeCode: "" },
  ];

  const [awaitingFinanceCode, awaitingApproval] = await Promise.all([
    canCode
      ? db.asset.count({
          where: {
            organizationId,
            // مواد are expensed on issue and never coded — counting them would
            // give المالية a queue they can never empty.
            itemClass: ItemClassValue.ASSET,
            OR: uncoded,
            receiptLine: liveReceipt,
          },
        })
      : Promise.resolve(0),

    canApprove
      ? db.asset.count({
          where: {
            organizationId,
            lifecycleStage: AssetLifecycleStage.PENDING,
            // Coded, i.e. the baton has actually been passed. An item still
            // waiting on المالية is not المستودعات' backlog — telling them
            // about it would make the badge a number they cannot act on.
            NOT: { OR: uncoded },
            receiptLine: liveReceipt,
          },
        })
      : Promise.resolve(0),
  ]);

  return { awaitingFinanceCode, awaitingApproval };
}
