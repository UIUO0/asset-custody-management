/**
 * Purchase-order aggregation rules.
 *
 * Two behaviours are pinned here because both are policy, not implementation,
 * and both are the kind of thing a later change reverts by accident:
 *
 * 1. **Which field is the order number** — `purchaseOrderNumber` when present,
 *    otherwise `purchaseRequestNumber`. The two forms carry different
 *    references and `orderNumberOf` is the only place that decides.
 * 2. **A cancelled receipt contributes nothing to the figures.** It is still
 *    counted separately and still listed, but its money is not committed spend
 *    and its items are not chased for coding. This was a live bug: order
 *    `PO-2026-118` read 35,503.08 across 3 receipts when one of them had been
 *    voided.
 *
 * @see {@link file://./purchase-order.server.ts}
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// why: the aggregation is application code over a single `findMany`; mocking
// the one query lets the grouping rules be tested without a database. The
// module under test is server-only and imports the real Prisma client.
const findMany = vi.fn();

const assetFindMany = vi.fn();
const assetCount = vi.fn();
const receiptUpdateMany = vi.fn();
const deleteGoodsReceiptMock = vi.fn();

// why: erasing a receipt has its own module and its own tests
// (`delete-receipt.test.ts`). What matters here is the order-wide gate in front
// of it — so the effect is stubbed and the assertions are about whether it was
// reached at all.
vi.mock("~/modules/goods-receipt/service.server", () => ({
  deleteGoodsReceipt: (...a: unknown[]) => deleteGoodsReceiptMock(...a),
}));
const teamMemberFindMany = vi.fn();

vi.mock("~/database/db.server", () => ({
  db: {
    goodsReceipt: {
      findMany: (...args: unknown[]) => findMany(...args),
      updateMany: (...args: unknown[]) => receiptUpdateMany(...args),
    },
    asset: {
      findMany: (...args: unknown[]) => assetFindMany(...args),
      count: (...args: unknown[]) => assetCount(...args),
    },
    teamMember: {
      findMany: (...args: unknown[]) => teamMemberFindMany(...args),
    },
  },
}));

// why: the approval effect (stage + booking flag + signature gate + notes) has
// its own module and its own tests. What matters here is the *order-level gate*
// in front of it — so the effect is stubbed and the assertions are about
// whether it was reached at all, and with which ids.
const approveAssetsByIds = vi.fn();
vi.mock("~/modules/asset/approve.server", () => ({
  approveAssetsByIds: (...args: unknown[]) => approveAssetsByIds(...args),
}));

const {
  approveOrderAssets,
  getHandoverCandidates,
  getOrderApprovalState,
  getPurchaseOrders,
  listDepartments,
  deletePurchaseOrder,
  orderNumberOf,
  voidPurchaseOrder,
} = await import("./purchase-order.server");

/** A receipt row shaped like the service's `select`. */
function receiptRow(
  overrides: Partial<{
    id: string;
    purchaseOrderNumber: string | null;
    purchaseRequestNumber: string | null;
    state: string;
    supplier: string | null;
    receiptDate: Date | null;
    createdAt: Date;
    totalHalalas: number;
    lines: Array<{
      id: string;
      assets: Array<{
        id: string;
        itemClass: string | null;
        financeCode: string | null;
      }>;
    }>;
  }> = {},
) {
  return {
    id: "r1",
    purchaseOrderNumber: "PO-1",
    purchaseRequestNumber: null,
    state: "SAVED",
    supplier: "مورد",
    receiptDate: new Date("2026-08-01"),
    createdAt: new Date("2026-08-01"),
    totalHalalas: 100_000,
    lines: [
      {
        id: "l1",
        assets: [{ id: "a1", itemClass: "ASSET", financeCode: null }],
      },
    ],
    ...overrides,
  };
}

describe("orderNumberOf", () => {
  it("prefers the purchase-order number", () => {
    expect(
      orderNumberOf({
        purchaseOrderNumber: "PO-9",
        purchaseRequestNumber: "PR-9",
      }),
    ).toBe("PO-9");
  });

  it("falls back to the purchase-request number", () => {
    expect(
      orderNumberOf({
        purchaseOrderNumber: null,
        purchaseRequestNumber: "PR-9",
      }),
    ).toBe("PR-9");
  });

  it("treats blank and whitespace-only references as no order", () => {
    expect(
      orderNumberOf({
        purchaseOrderNumber: "   ",
        purchaseRequestNumber: null,
      }),
    ).toBeNull();
    expect(
      orderNumberOf({ purchaseOrderNumber: null, purchaseRequestNumber: null }),
    ).toBeNull();
  });

  it("trims, so ` PO-1 ` and `PO-1` are the same order", () => {
    expect(
      orderNumberOf({
        purchaseOrderNumber: " PO-1 ",
        purchaseRequestNumber: null,
      }),
    ).toBe("PO-1");
  });
});

describe("getPurchaseOrders", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("groups receipts under one order number", async () => {
    findMany.mockResolvedValue([
      receiptRow({ id: "r1", totalHalalas: 100_000 }),
      receiptRow({ id: "r2", totalHalalas: 50_000 }),
    ]);

    const [order] = await getPurchaseOrders({ organizationId: "org" });

    expect(order.orderNumber).toBe("PO-1");
    expect(order.receiptCount).toBe(2);
    expect(order.totalHalalas).toBe(150_000);
    expect(order.itemCount).toBe(2);
  });

  it("excludes a voided receipt from every figure but still counts it", async () => {
    findMany.mockResolvedValue([
      receiptRow({ id: "r1", totalHalalas: 100_000 }),
      receiptRow({
        id: "r2",
        state: "VOIDED",
        totalHalalas: 900_000,
        lines: [
          {
            id: "l2",
            assets: [
              { id: "a2", itemClass: "ASSET", financeCode: null },
              { id: "a3", itemClass: "MATERIAL", financeCode: null },
            ],
          },
        ],
      }),
    ]);

    const [order] = await getPurchaseOrders({ organizationId: "org" });

    expect(order.totalHalalas).toBe(100_000);
    expect(order.receiptCount).toBe(1);
    expect(order.voidedReceiptCount).toBe(1);
    expect(order.itemCount).toBe(1);
    expect(order.assetCount).toBe(1);
    // The finance queue must not chase a delivery that was called off.
    expect(order.awaitingCodeCount).toBe(1);
  });

  it("keeps the supplier and the earliest date from a voided receipt", async () => {
    // The order still happened; only its money and its items are excluded.
    findMany.mockResolvedValue([
      receiptRow({
        id: "r1",
        supplier: "المورد الحالي",
        receiptDate: new Date("2026-08-10"),
      }),
      receiptRow({
        id: "r2",
        state: "VOIDED",
        supplier: "المورد الأول",
        receiptDate: new Date("2026-08-01"),
      }),
    ]);

    const [order] = await getPurchaseOrders({ organizationId: "org" });

    expect(order.suppliers).toEqual(["المورد الحالي", "المورد الأول"]);
    expect(order.firstReceiptAt).toEqual(new Date("2026-08-01"));
  });

  it("counts only أصول without a code as awaiting coding", async () => {
    findMany.mockResolvedValue([
      receiptRow({
        lines: [
          {
            id: "l1",
            assets: [
              { id: "a1", itemClass: "ASSET", financeCode: null },
              { id: "a2", itemClass: "ASSET", financeCode: "1-2-3" },
              { id: "a3", itemClass: "MATERIAL", financeCode: null },
              { id: "a4", itemClass: null, financeCode: null },
            ],
          },
        ],
      }),
    ]);

    const [order] = await getPurchaseOrders({ organizationId: "org" });

    expect(order.itemCount).toBe(4);
    expect(order.assetCount).toBe(2);
    expect(order.awaitingCodeCount).toBe(1);
  });

  it("skips receipts carrying no reference at all", async () => {
    findMany.mockResolvedValue([
      receiptRow({
        id: "r1",
        purchaseOrderNumber: null,
        purchaseRequestNumber: null,
      }),
    ]);

    await expect(getPurchaseOrders({ organizationId: "org" })).resolves.toEqual(
      [],
    );
  });

  it("scopes the query to the workspace", async () => {
    findMany.mockResolvedValue([]);

    await getPurchaseOrders({ organizationId: "org-42" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-42" }),
      }),
    );
  });
});

/**
 * Which assets a batch handover may cover.
 *
 * The exclusions are policy, and each one silently breaks something different
 * if it is dropped, so they are asserted against the emitted `where` rather
 * than against rows: the filtering happens in Postgres, and a test that fed
 * rows through would pass even after the clause was deleted.
 */
describe("getHandoverCandidates", () => {
  beforeEach(() => {
    assetFindMany.mockReset();
    assetFindMany.mockResolvedValue([]);
  });

  async function whereFor(orderNumber = "PO-1") {
    await getHandoverCandidates({ orderNumber, organizationId: "org-1" });
    return assetFindMany.mock.calls[0][0].where;
  }

  it("only offers assets the warehouse has already released", async () => {
    // why: a PENDING item has not finished intake — it is not yet the
    // warehouse's to give away.
    expect((await whereFor()).lifecycleStage).toBe("READY");
  });

  it("excludes anything already in someone's custody", async () => {
    // why: `openHandover` is all-or-nothing, so one held asset would reject the
    // whole batch and strand an operator handing over the rest of the order.
    // `none`, not `is: null` — custody went 1:many with quantity tracking.
    expect((await whereFor()).custody).toEqual({ none: {} });
  });

  it("excludes items admitted by a cancelled receipt", async () => {
    const where = await whereFor();
    expect(where.receiptLine.receipt.state).toEqual({ not: "VOIDED" });
  });

  it("scopes every leg of the query to the caller's workspace", async () => {
    // why: the order number comes from the URL. Without the org on BOTH the
    // asset and the receipt, a number guessed from another workspace would
    // return that workspace's stock.
    const where = await whereFor();
    expect(where.organizationId).toBe("org-1");
    expect(where.receiptLine.receipt.organizationId).toBe("org-1");
  });

  it("matches either order field, exactly, and trims the input", async () => {
    // Mirrors `orderNumberOf`: مذكرة carries أمر الشراء, محضر carries رقم الطلب.
    const where = await whereFor("  PO-1  ");
    expect(where.receiptLine.receipt.OR).toEqual([
      { purchaseOrderNumber: "PO-1" },
      { purchaseRequestNumber: "PO-1" },
    ]);
  });
});

describe("listDepartments", () => {
  it("returns desks only, never people", async () => {
    teamMemberFindMany.mockReset();
    teamMemberFindMany.mockResolvedValue([]);

    await listDepartments({ organizationId: "org-1" });

    expect(teamMemberFindMany.mock.calls[0][0].where).toEqual({
      organizationId: "org-1",
      isDepartment: true,
      deletedAt: null,
    });
  });
});

/**
 * The finance-coding lock on order-wide approval.
 *
 * Approval is what puts stock into circulation, and once it is in circulation
 * it can be handed to a department the same day. Chasing a رقم ترميز for an
 * item already on somebody's desk is a much worse job than assigning it while
 * the delivery is still on the warehouse floor — so coding comes first, and
 * these tests pin the three ways that ordering could quietly be lost.
 *
 * The assertions are about the **gate**, not the effect: `approveAssetsByIds`
 * is stubbed, so "did it reach the effect, and with which ids" is the question.
 */
describe("order approval gate", () => {
  beforeEach(() => {
    assetCount.mockReset();
    assetFindMany.mockReset();
    approveAssetsByIds.mockReset();
    approveAssetsByIds.mockResolvedValue(0);
  });

  /** `getOrderApprovalState` issues [pendingCount, awaitingCodeCount]. */
  function counts({ pending, uncoded }: { pending: number; uncoded: number }) {
    assetCount.mockResolvedValueOnce(pending).mockResolvedValueOnce(uncoded);
  }

  describe("getOrderApprovalState", () => {
    it("opens the gate when every أصل is coded", async () => {
      counts({ pending: 4, uncoded: 0 });

      await expect(
        getOrderApprovalState({ orderNumber: "PO-1", organizationId: "org-1" }),
      ).resolves.toEqual({
        pendingCount: 4,
        awaitingCodeCount: 0,
        canApprove: true,
      });
    });

    it("holds the gate shut while a code is missing", async () => {
      counts({ pending: 4, uncoded: 1 });

      const state = await getOrderApprovalState({
        orderNumber: "PO-1",
        organizationId: "org-1",
      });

      expect(state.canApprove).toBe(false);
    });

    it("does not offer approval when nothing is pending", async () => {
      // Fully approved already: the button would do nothing, and a control that
      // does nothing reads as broken.
      counts({ pending: 0, uncoded: 0 });

      const state = await getOrderApprovalState({
        orderNumber: "PO-1",
        organizationId: "org-1",
      });

      expect(state.canApprove).toBe(false);
    });

    it("counts only أصول as uncoded, and treats a cleared code as uncoded", async () => {
      // مواد are expensed on issue and never coded — counting them would lock
      // the order forever. A cleared code arrives as "" rather than null, so
      // testing for null alone would let it pass as coded.
      counts({ pending: 1, uncoded: 0 });

      await getOrderApprovalState({
        orderNumber: "PO-1",
        organizationId: "org-1",
      });

      const codeWhere = assetCount.mock.calls[1][0].where;

      expect(codeWhere.itemClass).toBe("ASSET");
      expect(codeWhere.OR).toEqual([
        { financeCode: null },
        { financeCode: "" },
      ]);
    });

    it("ignores items from a cancelled receipt on both counts", async () => {
      // A called-off delivery is out of the order's totals and out of المالية's
      // queue; letting it block approval would be the same mistake elsewhere.
      counts({ pending: 1, uncoded: 0 });

      await getOrderApprovalState({
        orderNumber: "PO-1",
        organizationId: "org-1",
      });

      for (const call of assetCount.mock.calls) {
        expect(call[0].where.receiptLine.receipt.state).toEqual({
          not: "VOIDED",
        });
      }
    });
  });

  describe("approveOrderAssets", () => {
    it("refuses while any أصل is uncoded, and never reaches the effect", async () => {
      // The button being disabled is a hint; this is the fence. The page's
      // state is as old as its last load, and المالية may have cleared a code
      // in another tab since.
      counts({ pending: 3, uncoded: 2 });

      // Asserted on status + effect rather than wording: the copy is Arabic
      // prose that will be reworded, and what must not change is that the call
      // is refused as a conflict and nothing moves.
      await expect(
        approveOrderAssets({
          orderNumber: "PO-1",
          organizationId: "org-1",
          userId: "u-1",
        }),
      ).rejects.toMatchObject({ status: 409 });

      expect(approveAssetsByIds).not.toHaveBeenCalled();
    });

    it("refuses when there is nothing pending", async () => {
      counts({ pending: 0, uncoded: 0 });

      await expect(
        approveOrderAssets({
          orderNumber: "PO-1",
          organizationId: "org-1",
          userId: "u-1",
        }),
      ).rejects.toMatchObject({ status: 409 });

      expect(approveAssetsByIds).not.toHaveBeenCalled();
    });

    it("approves the order's pending items once the gate opens", async () => {
      counts({ pending: 2, uncoded: 0 });
      assetFindMany.mockResolvedValue([{ id: "a-1" }, { id: "a-2" }]);
      approveAssetsByIds.mockResolvedValue(2);

      await expect(
        approveOrderAssets({
          orderNumber: "PO-1",
          organizationId: "org-1",
          userId: "u-1",
        }),
      ).resolves.toBe(2);

      expect(approveAssetsByIds).toHaveBeenCalledWith({
        assetIds: ["a-1", "a-2"],
        organizationId: "org-1",
        userId: "u-1",
      });
    });

    it("derives the assets from the order, never from a caller-supplied list", async () => {
      // The whole reason this takes an order number and not asset ids: a client
      // posting its own list could approve anything in the workspace under
      // cover of an order number it is merely allowed to read.
      counts({ pending: 1, uncoded: 0 });
      assetFindMany.mockResolvedValue([{ id: "a-1" }]);

      await approveOrderAssets({
        orderNumber: "  PO-1  ",
        organizationId: "org-1",
        userId: "u-1",
      });

      const where = assetFindMany.mock.calls[0][0].where;

      expect(where.organizationId).toBe("org-1");
      expect(where.lifecycleStage).toBe("PENDING");
      // Trimmed, and matched exactly — a prefix match would fold PO-1 into PO-11.
      expect(where.receiptLine.receipt.OR).toEqual([
        { purchaseOrderNumber: "PO-1" },
        { purchaseRequestNumber: "PO-1" },
      ]);
    });
  });
});

/**
 * Cancelling a whole order's paperwork.
 *
 * The rule worth pinning is what it leaves alone. An order has no row of its
 * own, so "cancel the order" is "cancel its receipts" — and the stock those
 * receipts admitted stays put, because it physically arrived. A version of this
 * that also deleted assets would be disposing of inventory on the strength of a
 * form, and nothing on screen would say so.
 */
describe("voidPurchaseOrder", () => {
  beforeEach(() => {
    findMany.mockReset();
    receiptUpdateMany.mockReset();
    // Reset here too: the "touches nothing but the receipt state" case asserts
    // this spy was never called, which is only meaningful if earlier blocks'
    // calls are cleared first.
    assetFindMany.mockReset();
    receiptUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("cancels only the receipts that are still live", async () => {
    findMany.mockResolvedValue([
      { id: "r-1", state: "SIGNED" },
      { id: "r-2", state: "VOIDED" },
      { id: "r-3", state: "SAVED" },
    ]);
    receiptUpdateMany.mockResolvedValue({ count: 2 });

    await expect(
      voidPurchaseOrder({ orderNumber: "PO-1", organizationId: "org-1" }),
    ).resolves.toBe(2);

    const where = receiptUpdateMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: ["r-1", "r-3"] });
    // Re-scoped on the write, not trusted from the read above.
    expect(where.organizationId).toBe("org-1");
    expect(where.state).toEqual({ not: "VOIDED" });
  });

  it("touches nothing but the receipt state", async () => {
    // The assets stay. See the service docblock for why.
    findMany.mockResolvedValue([{ id: "r-1", state: "SAVED" }]);
    receiptUpdateMany.mockResolvedValue({ count: 1 });

    await voidPurchaseOrder({ orderNumber: "PO-1", organizationId: "org-1" });

    expect(receiptUpdateMany.mock.calls[0][0].data).toEqual({
      state: "VOIDED",
    });
    expect(assetFindMany).not.toHaveBeenCalled();
  });

  it("refuses an order number nothing was booked against", async () => {
    findMany.mockResolvedValue([]);

    await expect(
      voidPurchaseOrder({ orderNumber: "PO-nope", organizationId: "org-1" }),
    ).rejects.toMatchObject({ status: 404 });

    expect(receiptUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an order that is already fully cancelled", async () => {
    // Not an error the operator caused — but re-writing rows to the state they
    // are already in would report "cancelled 3" for a click that changed
    // nothing.
    findMany.mockResolvedValue([
      { id: "r-1", state: "VOIDED" },
      { id: "r-2", state: "VOIDED" },
    ]);

    await expect(
      voidPurchaseOrder({ orderNumber: "PO-1", organizationId: "org-1" }),
    ).rejects.toMatchObject({ status: 409 });

    expect(receiptUpdateMany).not.toHaveBeenCalled();
  });

  it("matches the order number exactly, trimmed", async () => {
    // A prefix match would fold PO-1 into PO-11 and cancel the wrong delivery.
    findMany.mockResolvedValue([{ id: "r-1", state: "SAVED" }]);

    await voidPurchaseOrder({
      orderNumber: "  PO-1  ",
      organizationId: "org-1",
    });

    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { purchaseOrderNumber: "PO-1" },
      { purchaseRequestNumber: "PO-1" },
    ]);
  });
});

/**
 * Erasing a whole order.
 *
 * The property worth pinning is that the movement check runs **across the whole
 * order before anything is removed**. Erasing receipt-by-receipt and letting
 * each guard itself would leave the order half-gone when the third receipt is
 * refused — and there is no undo to reach for.
 */
/** A receipt row shaped like `deletePurchaseOrder`'s `select`. */
function orderReceipt(id: string, state = "SAVED") {
  return { id, reference: `RCV-2026-${id}`, state };
}

describe("deletePurchaseOrder", () => {
  beforeEach(() => {
    findMany.mockReset();
    assetFindMany.mockReset();
    assetFindMany.mockResolvedValue([]);
    deleteGoodsReceiptMock.mockReset();
    deleteGoodsReceiptMock.mockResolvedValue({
      reference: "ref",
      assetsDeleted: 2,
    });
  });

  it("erases every receipt on the order and totals what went", async () => {
    findMany.mockResolvedValue([orderReceipt("r-1"), orderReceipt("r-2")]);

    await expect(
      deletePurchaseOrder({
        orderNumber: "PO-1",
        organizationId: "org-1",
        canDeleteSigned: true,
      }),
    ).resolves.toEqual({ receiptsDeleted: 2, assetsDeleted: 4 });

    expect(deleteGoodsReceiptMock).toHaveBeenCalledTimes(2);
  });

  it("checks the whole order before removing anything", async () => {
    // All-or-nothing: a refusal must arrive before the first delete, not
    // between the second and the third.
    findMany.mockResolvedValue([
      orderReceipt("r-1"),
      orderReceipt("r-2"),
      orderReceipt("r-3"),
    ]);
    assetFindMany.mockResolvedValue([{ title: "لابتوب" }]);

    await expect(
      deletePurchaseOrder({
        orderNumber: "PO-1",
        organizationId: "org-1",
        canDeleteSigned: true,
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(deleteGoodsReceiptMock).not.toHaveBeenCalled();
  });

  it("looks for movement across every asset the order produced", async () => {
    findMany.mockResolvedValue([orderReceipt("r-1")]);

    await deletePurchaseOrder({
      orderNumber: "PO-1",
      organizationId: "org-1",
      canDeleteSigned: true,
    });

    const where = assetFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { custody: { some: {} } },
      { custodyHandovers: { some: {} } },
    ]);
    // Scoped to this order's receipts, not the whole workspace.
    expect(where.receiptLine.receipt.OR).toEqual([
      { purchaseOrderNumber: "PO-1" },
      { purchaseRequestNumber: "PO-1" },
    ]);
  });

  it("refuses the whole order when one of its receipts is signed", async () => {
    // Erasing an order is all-or-nothing, so one signed document anywhere in
    // it puts the order out of المستودعات' reach — otherwise a refusal on the
    // third receipt would leave the first two already gone.
    findMany.mockResolvedValue([
      orderReceipt("r-1"),
      orderReceipt("r-2", "SIGNED"),
    ]);

    await expect(
      deletePurchaseOrder({
        orderNumber: "PO-1",
        organizationId: "org-1",
        canDeleteSigned: false,
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(deleteGoodsReceiptMock).not.toHaveBeenCalled();
  });

  it("names the signed receipt so the operator knows which one blocks it", async () => {
    findMany.mockResolvedValue([orderReceipt("r-2", "SIGNED")]);

    await expect(
      deletePurchaseOrder({
        orderNumber: "PO-1",
        organizationId: "org-1",
        canDeleteSigned: false,
      }),
    ).rejects.toThrow(/RCV-2026-r-2/);
  });

  it("erases an order of unsigned receipts for that same caller", async () => {
    findMany.mockResolvedValue([orderReceipt("r-1"), orderReceipt("r-2")]);

    await expect(
      deletePurchaseOrder({
        orderNumber: "PO-1",
        organizationId: "org-1",
        canDeleteSigned: false,
      }),
    ).resolves.toMatchObject({ receiptsDeleted: 2 });
  });

  it("passes the caller's reach down to each receipt", async () => {
    // The per-receipt guard is the real one; this only has to not drop it.
    findMany.mockResolvedValue([orderReceipt("r-1")]);

    await deletePurchaseOrder({
      orderNumber: "PO-1",
      organizationId: "org-1",
      canDeleteSigned: false,
    });

    expect(deleteGoodsReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({ canDeleteSigned: false }),
    );
  });

  it("refuses an order number nothing was booked against", async () => {
    findMany.mockResolvedValue([]);

    await expect(
      deletePurchaseOrder({
        orderNumber: "PO-nope",
        organizationId: "org-1",
        canDeleteSigned: true,
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(deleteGoodsReceiptMock).not.toHaveBeenCalled();
  });
});
