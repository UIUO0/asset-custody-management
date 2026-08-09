/**
 * Tracking items by their purchase-order number.
 *
 * Everything that arrived under one order number can be found from that number:
 * which receipts booked it in, which items it produced, what each cost, and
 * which of them المالية still has to code.
 *
 * ## Derived, not stored
 *
 * There is no `PurchaseOrder` table. An order here **is** the number written on
 * the receipt — the authority's own reference, issued by a purchasing process
 * this system is not part of. Creating a table for it would mean inventing a
 * lifecycle (who opens an order? when does it close?) that nothing in the
 * product drives, and giving operators a second place to mistype the number.
 *
 * Grouping by the number costs one aggregate query and cannot drift from the
 * receipts, because it *is* the receipts.
 *
 * The trade-off, stated plainly: two receipts that spell the same order
 * differently ("PO-118" and "po 118") are two orders here. Normalising them
 * would be guessing, and guessing wrong merges two suppliers' deliveries into
 * one order — worse than showing both and letting someone correct the typo.
 *
 * ## Which field is "the order number"
 *
 * مذكرة استلام carries أمر الشراء; محضر استلام carries رقم طلب الشراء/التعميد.
 * They are different documents in the purchasing process but play the same role
 * here — the reference the delivery arrived against — so both feed this view,
 * and {@link orderNumberOf} is the single place that decides.
 *
 * @see {@link file://./service.server.ts} the receipts these are derived from
 * @see {@link file://./../../routes/_layout+/purchase-orders._index.tsx} the UI
 */

import type {
  GoodsReceipt,
  ItemCategory,
  ItemClass,
  Prisma,
} from "@prisma/client";
// Value import, not just a type: this is a `.server` module, so the real Prisma
// enum is available. Browser-reachable modules must use `./enums` instead.
import { AssetLifecycleStage } from "@prisma/client";
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import { ItemClassValue, ReceiptState } from "./enums";

const label = "Assets" as const;

/** The receipt fields needed to resolve an order number. */
type OrderNumberSource = Pick<
  GoodsReceipt,
  "purchaseOrderNumber" | "purchaseRequestNumber"
>;

/**
 * The order number a receipt was booked against.
 *
 * `purchaseOrderNumber` (نموذج 2) first, then `purchaseRequestNumber`
 * (نموذج 3). A receipt with neither returns `null` and simply does not appear
 * in this view — it is a delivery nobody referenced an order for, which is a
 * gap in the paperwork rather than an order.
 *
 * @param receipt - Any receipt row carrying both reference fields
 * @returns The trimmed order number, or null
 */
export function orderNumberOf(receipt: OrderNumberSource): string | null {
  const raw = receipt.purchaseOrderNumber ?? receipt.purchaseRequestNumber;
  const trimmed = raw?.trim();

  return trimmed ? trimmed : null;
}

/** One order as it appears in the index. */
export type PurchaseOrderSummary = {
  orderNumber: string;
  /** Suppliers seen on this order's receipts — usually one. */
  suppliers: string[];
  receiptCount: number;
  itemCount: number;
  /** How many of its items are أصول. */
  assetCount: number;
  /** أصول still without a رقم ترميز — the finance queue for this order. */
  awaitingCodeCount: number;
  totalHalalas: number;
  /**
   * Cancelled receipts on this order.
   *
   * Surfaced rather than silently dropped: an order whose numbers exclude a
   * receipt should say so, or the totals look like an arithmetic error to
   * anyone comparing them against the documents.
   */
  voidedReceiptCount: number;
  /** Earliest receipt date on the order, for sorting and display. */
  firstReceiptAt: Date | null;
};

/**
 * Every order number seen in this workspace, with its totals.
 *
 * Built in application code from the receipts rather than as one SQL
 * `GROUP BY`: the grouping key is `COALESCE` of two nullable columns and the
 * counts span two further relations, so the raw query would be long, untyped
 * and would still need a second pass for the per-item counts. Receipt volume is
 * measured in hundreds per year, not millions — the clarity is worth more than
 * the round trip saved.
 *
 * @param args.organizationId - Workspace, applied to every read
 * @param args.search - Matches the order number or a supplier name
 * @returns Orders, newest first
 */
export async function getPurchaseOrders({
  organizationId,
  search,
}: {
  organizationId: string;
  search?: string | null;
}): Promise<PurchaseOrderSummary[]> {
  try {
    const receipts = await db.goodsReceipt.findMany({
      where: {
        organizationId,
        // A receipt with no reference at all is not an order.
        OR: [
          { purchaseOrderNumber: { not: null } },
          { purchaseRequestNumber: { not: null } },
        ],
      },
      select: {
        id: true,
        purchaseOrderNumber: true,
        purchaseRequestNumber: true,
        state: true,
        supplier: true,
        receiptDate: true,
        createdAt: true,
        totalHalalas: true,
        lines: {
          select: {
            id: true,
            assets: {
              select: { id: true, itemClass: true, financeCode: true },
            },
          },
        },
      },
    });

    const byOrder = new Map<string, PurchaseOrderSummary>();

    for (const receipt of receipts) {
      const orderNumber = orderNumberOf(receipt);
      if (!orderNumber) continue;

      const existing = byOrder.get(orderNumber) ?? {
        orderNumber,
        suppliers: [],
        receiptCount: 0,
        itemCount: 0,
        assetCount: 0,
        awaitingCodeCount: 0,
        totalHalalas: 0,
        voidedReceiptCount: 0,
        firstReceiptAt: null,
      };

      if (receipt.supplier && !existing.suppliers.includes(receipt.supplier)) {
        existing.suppliers.push(receipt.supplier);
      }

      const receiptAt = receipt.receiptDate ?? receipt.createdAt;
      if (!existing.firstReceiptAt || receiptAt < existing.firstReceiptAt) {
        existing.firstReceiptAt = receiptAt;
      }

      /**
       * A cancelled receipt contributes nothing to the order's figures.
       *
       * Money on a voided document is not committed spend, and المالية read
       * these totals — an order that silently included a cancelled delivery
       * would overstate what the authority paid. Its items are not chased for
       * coding either: nobody should be assigning accounting numbers against a
       * delivery that was called off.
       *
       * The receipt is still counted separately (`voidedReceiptCount`) and
       * still listed in the detail view, because the stock it created was
       * deliberately left in place (see `voidGoodsReceipt`) and has to stay
       * traceable to the document that admitted it.
       */
      if (receipt.state === ReceiptState.VOIDED) {
        existing.voidedReceiptCount += 1;
        byOrder.set(orderNumber, existing);
        continue;
      }

      existing.receiptCount += 1;
      existing.totalHalalas += receipt.totalHalalas;

      for (const line of receipt.lines) {
        for (const asset of line.assets) {
          existing.itemCount += 1;

          if (asset.itemClass === ItemClassValue.ASSET) {
            existing.assetCount += 1;
            if (!asset.financeCode) existing.awaitingCodeCount += 1;
          }
        }
      }

      byOrder.set(orderNumber, existing);
    }

    let orders = [...byOrder.values()];

    // Filtering after grouping, not in the query: the search should match an
    // order that any of its receipts names, and a WHERE on the receipts would
    // silently drop the other receipts from that order's totals.
    if (search) {
      const needle = search.trim().toLowerCase();

      orders = orders.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(needle) ||
          order.suppliers.some((supplier) =>
            supplier.toLowerCase().includes(needle),
          ),
      );
    }

    return orders.sort(
      (a, b) =>
        (b.firstReceiptAt?.getTime() ?? 0) - (a.firstReceiptAt?.getTime() ?? 0),
    );
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "تعذّر تحميل أوامر الشراء.",
      additionalData: { organizationId },
      label,
    });
  }
}

/** One item that arrived on an order. */
export type PurchaseOrderItem = {
  id: string;
  title: string;
  sequentialId: string | null;
  itemClass: ItemClass | null;
  itemCategory: ItemCategory | null;
  unitPriceHalalas: number;
  quantity: number | null;
  financeCode: string | null;
  financeCodedAt: Date | null;
  lifecycleStage: string;
  /** Which receipt admitted it, for the trace back to the signed document. */
  receiptId: string;
  receiptReference: string;
  /**
   * True when the receipt that admitted it was later cancelled.
   *
   * The item is still listed — voiding a receipt deliberately leaves the stock
   * alone — but it must not read as ordinary: it is excluded from the order's
   * totals and from المالية's coding queue, and a row that looked identical to
   * a live one would make those numbers seem wrong.
   */
  fromVoidedReceipt: boolean;
};

/** An order with everything that arrived under it. */
export type PurchaseOrderDetail = {
  orderNumber: string;
  suppliers: string[];
  receipts: Array<{
    id: string;
    reference: string;
    type: string;
    state: string;
    receiptDate: Date | null;
    totalHalalas: number;
  }>;
  items: PurchaseOrderItem[];
  totalHalalas: number;
};

/**
 * One order: its receipts and every item they produced.
 *
 * @param args.orderNumber - The number as written on the receipts
 * @param args.organizationId - Workspace, applied to every read
 * @returns The order detail
 * @throws {ShelfError} 404 when no receipt in this workspace names that number
 */
export async function getPurchaseOrder({
  orderNumber,
  organizationId,
}: {
  orderNumber: string;
  organizationId: string;
}): Promise<PurchaseOrderDetail> {
  const trimmed = orderNumber.trim();

  // Exact match, not `contains`: an order number is an identifier, and a
  // prefix match would fold "PO-1" into "PO-11".
  const where: Prisma.GoodsReceiptWhereInput = {
    organizationId,
    OR: [{ purchaseOrderNumber: trimmed }, { purchaseRequestNumber: trimmed }],
  };

  const receipts = await db.goodsReceipt.findMany({
    where,
    orderBy: [{ receiptDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      reference: true,
      type: true,
      state: true,
      receiptDate: true,
      totalHalalas: true,
      supplier: true,
      purchaseOrderNumber: true,
      purchaseRequestNumber: true,
      lines: {
        orderBy: { lineNumber: "asc" },
        select: {
          unitPriceHalalas: true,
          itemCategory: true,
          assets: {
            orderBy: { title: "asc" },
            select: {
              id: true,
              title: true,
              sequentialId: true,
              itemClass: true,
              itemCategory: true,
              quantity: true,
              financeCode: true,
              financeCodedAt: true,
              lifecycleStage: true,
            },
          },
        },
      },
    },
  });

  if (receipts.length === 0) {
    throw new ShelfError({
      cause: null,
      message: "أمر الشراء غير موجود.",
      additionalData: { orderNumber: trimmed, organizationId },
      label,
      status: 404,
      shouldBeCaptured: false,
    });
  }

  const items: PurchaseOrderItem[] = [];
  const suppliers: string[] = [];

  for (const receipt of receipts) {
    if (receipt.supplier && !suppliers.includes(receipt.supplier)) {
      suppliers.push(receipt.supplier);
    }

    for (const line of receipt.lines) {
      for (const asset of line.assets) {
        items.push({
          id: asset.id,
          title: asset.title,
          sequentialId: asset.sequentialId,
          itemClass: asset.itemClass,
          itemCategory: asset.itemCategory,
          // From the line, not the asset: `Asset.valuation` is a rounded float
          // and this view is where المالية reads prices.
          unitPriceHalalas: line.unitPriceHalalas,
          quantity: asset.quantity,
          financeCode: asset.financeCode,
          financeCodedAt: asset.financeCodedAt,
          lifecycleStage: asset.lifecycleStage,
          receiptId: receipt.id,
          receiptReference: receipt.reference,
          fromVoidedReceipt: receipt.state === ReceiptState.VOIDED,
        });
      }
    }
  }

  return {
    orderNumber: trimmed,
    suppliers,
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      reference: receipt.reference,
      type: receipt.type,
      state: receipt.state,
      receiptDate: receipt.receiptDate,
      totalHalalas: receipt.totalHalalas,
    })),
    items,
    // Excludes cancelled receipts, matching the index. Two screens showing
    // different totals for one order is worse than either number alone.
    totalHalalas: receipts.reduce(
      (sum, receipt) =>
        receipt.state === ReceiptState.VOIDED
          ? sum
          : sum + receipt.totalHalalas,
      0,
    ),
  };
}

/**
 * Records المالية's coding number on an asset.
 *
 * Refuses anything that is not a أصل: مواد are expensed on issue and never
 * coded, so a code on one would be a number nobody can explain. Refuses an
 * unclassified item for the same reason — the classification is the thing that
 * says a code is due.
 *
 * The code itself is stored as typed. By the approved decision (2026-07-27)
 * there is no format and no uniqueness constraint: the coding scheme belongs
 * entirely to the finance department, and validating it here would be this
 * system inventing a rule it was told not to have.
 *
 * @param args.assetId - The asset being coded
 * @param args.organizationId - Workspace, applied in the `where` clause
 * @param args.financeCode - رقم الترميز as typed; empty clears it
 * @param args.userId - The finance user, recorded on the row
 * @throws {ShelfError} 404 if the asset is not in this workspace, 400 if it is
 *   not an asset that needs coding
 */
export async function setAssetFinanceCode({
  assetId,
  organizationId,
  financeCode,
  userId,
}: {
  assetId: string;
  organizationId: string;
  financeCode: string;
  userId: string;
}): Promise<void> {
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
    select: { id: true, itemClass: true },
  });

  if (!asset) {
    throw new ShelfError({
      cause: null,
      message: "الصنف غير موجود.",
      additionalData: { assetId, organizationId },
      label,
      status: 404,
      shouldBeCaptured: false,
    });
  }

  if (asset.itemClass !== ItemClassValue.ASSET) {
    throw new ShelfError({
      cause: null,
      message: "الترميز للأصول فقط — المواد تُصرف ولا تُرمَّز.",
      additionalData: { assetId, itemClass: asset.itemClass },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const trimmed = financeCode.trim();

  await db.asset.updateMany({
    where: { id: assetId, organizationId },
    data: trimmed
      ? {
          financeCode: trimmed,
          financeCodedAt: new Date(),
          financeCodedById: userId,
        }
      : // Clearing the code clears its provenance too — a timestamp and an
        // author for a code that no longer exists would be a lie in the record.
        { financeCode: null, financeCodedAt: null, financeCodedById: null },
  });
}

/**
 * A department desk that can receive a batch (إدارة المرافق, إدارة تقنية
 * المعلومات).
 */
export type DepartmentOption = { id: string; name: string };

/**
 * Lists the department desks a batch may be handed to.
 *
 * Data, not code: departments are `TeamMember` rows flagged `isDepartment`, so
 * a third one appears here the moment somebody creates it.
 *
 * @param organizationId - Workspace, applied to the read
 * @returns Departments, ordered by name
 */
export async function listDepartments({
  organizationId,
}: {
  organizationId: string;
}): Promise<DepartmentOption[]> {
  return db.teamMember.findMany({
    where: { organizationId, isDepartment: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * The assets on an order that can still be handed to a department.
 *
 * Three exclusions, each for its own reason:
 *
 * - **`PENDING` items.** Intake is not finished; the warehouse has not yet
 *   released them into circulation, so they are not the warehouse's to give.
 * - **Items already in someone's custody.** They have left the shelf. Including
 *   them would make `openHandover` reject the entire batch (it is all-or-
 *   nothing by design), stranding an operator who just wants to hand over the
 *   rest of the order.
 * - **Items from a cancelled receipt.** The delivery was called off. The stock
 *   is deliberately left alone, but it must not be swept into a batch as if it
 *   had arrived normally — same rule that keeps it out of the order's totals.
 *
 * Returning the *eligible* set rather than everything is what lets the caller
 * show an honest count before anyone signs anything.
 *
 * @param args.orderNumber - The number as written on the receipts
 * @param args.organizationId - Workspace, applied to every read
 * @returns Asset ids, titles and stock levels, ordered by title. `quantity`
 *   is what a quantity-tracked line hands over in full; `null` for
 *   individually-tracked assets, which always move as one unit.
 */
export async function getHandoverCandidates({
  orderNumber,
  organizationId,
}: {
  orderNumber: string;
  organizationId: string;
}): Promise<Array<{ id: string; title: string; quantity: number | null }>> {
  const trimmed = orderNumber.trim();

  return db.asset.findMany({
    where: {
      organizationId,
      lifecycleStage: AssetLifecycleStage.READY,
      // No custody rows at all — `custody` is 1:many since quantity tracking,
      // so "unheld" is `none`, not `is: null`.
      custody: { none: {} },
      receiptLine: {
        receipt: {
          organizationId,
          state: { not: ReceiptState.VOIDED },
          OR: [
            { purchaseOrderNumber: trimmed },
            { purchaseRequestNumber: trimmed },
          ],
        },
      },
    },
    orderBy: { title: "asc" },
    select: { id: true, title: true, quantity: true },
  });
}
