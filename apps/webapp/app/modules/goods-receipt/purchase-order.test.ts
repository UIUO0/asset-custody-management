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
const teamMemberFindMany = vi.fn();

vi.mock("~/database/db.server", () => ({
  db: {
    goodsReceipt: { findMany: (...args: unknown[]) => findMany(...args) },
    asset: { findMany: (...args: unknown[]) => assetFindMany(...args) },
    teamMember: {
      findMany: (...args: unknown[]) => teamMemberFindMany(...args),
    },
  },
}));

const {
  getHandoverCandidates,
  getPurchaseOrders,
  listDepartments,
  orderNumberOf,
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
