/**
 * Erasing a goods receipt.
 *
 * This is the only operation in the intake flow with no way back, so the tests
 * are about what it refuses and what order it removes things in — not about the
 * happy path, which is one `deleteMany` and hard to get wrong.
 *
 * The refusal is the important half. `Custody` and `CustodyHandoverAsset` both
 * cascade on `assetId`, so erasing an asset that has moved would delete a line
 * out of a محضر two people signed — leaving the signatures intact beside a
 * shorter list. Nothing would report that; it surfaces at the next inventory
 * count, if ever.
 *
 * @see {@link file://./service.server.ts} `deleteGoodsReceipt`
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const receiptFindFirst = vi.fn();
const assetFindMany = vi.fn();
const assetDeleteMany = vi.fn();
const receiptDeleteMany = vi.fn();
const transaction = vi.fn();

// why: the function is a guard plus a two-statement transaction; mocking the
// client is what lets the guard be tested without a database.
vi.mock("~/database/db.server", () => ({
  db: {
    goodsReceipt: {
      findFirst: (...a: unknown[]) => receiptFindFirst(...a),
      deleteMany: (...a: unknown[]) => receiptDeleteMany(...a),
    },
    asset: {
      findMany: (...a: unknown[]) => assetFindMany(...a),
      deleteMany: (...a: unknown[]) => assetDeleteMany(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

// why: the module pulls in the whole receipt service, which reaches Supabase
// storage and the asset service at import time.
vi.mock("~/integrations/supabase/client", () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({}) } }),
}));
vi.mock("~/modules/asset/service.server", () => ({ createAsset: vi.fn() }));

const { deleteGoodsReceipt } = await import("./service.server");

/** Runs the transaction callback against the same mocked delegates. */
function runTransaction() {
  transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb({
      asset: { deleteMany: assetDeleteMany },
      goodsReceipt: { deleteMany: receiptDeleteMany },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  assetFindMany.mockResolvedValue([]);
  assetDeleteMany.mockResolvedValue({ count: 0 });
  receiptDeleteMany.mockResolvedValue({ count: 1 });
  runTransaction();
});

/** A receipt shaped like the service's `select`, with N assets. */
function receiptWith(titles: string[], state = "SAVED") {
  return {
    id: "r-1",
    reference: "EPDA-RCV-2026-0001",
    state,
    lines: [
      {
        assets: titles.map((title, i) => ({ id: `a-${i + 1}`, title })),
      },
    ],
  };
}

describe("deleteGoodsReceipt", () => {
  it("refuses when an asset is in custody or on a محضر", async () => {
    // The whole reason the guard exists — see the module docblock.
    receiptFindFirst.mockResolvedValue(receiptWith(["لابتوب", "كرسي"]));
    assetFindMany.mockResolvedValue([{ title: "لابتوب" }]);

    await expect(
      deleteGoodsReceipt({
        id: "r-1",
        organizationId: "org-1",
        canDeleteSigned: true,
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(transaction).not.toHaveBeenCalled();
    expect(assetDeleteMany).not.toHaveBeenCalled();
  });

  it("names the items that moved, so the operator knows what to unwind", async () => {
    receiptFindFirst.mockResolvedValue(receiptWith(["لابتوب"]));
    assetFindMany.mockResolvedValue([{ title: "لابتوب" }]);

    await expect(
      deleteGoodsReceipt({
        id: "r-1",
        organizationId: "org-1",
        canDeleteSigned: true,
      }),
    ).rejects.toThrow(/لابتوب/);
  });

  it("asks about movement, not paperwork state", async () => {
    // A signed receipt whose stock never left the shelf is erasable; an
    // unsigned one whose stock was handed out is not. The query must therefore
    // test custody and handovers, never `state`.
    receiptFindFirst.mockResolvedValue(receiptWith(["كرسي"]));

    await deleteGoodsReceipt({
      id: "r-1",
      organizationId: "org-1",
      canDeleteSigned: true,
    });

    const where = assetFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { custody: { some: {} } },
      { custodyHandovers: { some: {} } },
    ]);
    expect(where).not.toHaveProperty("state");
    expect(where.organizationId).toBe("org-1");
  });

  it("erases the assets before the receipt", async () => {
    // `Asset.receiptLine` is SET NULL: deleting the receipt first would orphan
    // the assets instead of taking them along — and an asset with no receipt
    // line is exactly the shape that passes the approval gate unchecked.
    receiptFindFirst.mockResolvedValue(receiptWith(["كرسي", "طاولة"]));
    const order: string[] = [];
    assetDeleteMany.mockImplementation(() => {
      order.push("assets");
      return Promise.resolve({ count: 2 });
    });
    receiptDeleteMany.mockImplementation(() => {
      order.push("receipt");
      return Promise.resolve({ count: 1 });
    });

    const result = await deleteGoodsReceipt({
      id: "r-1",
      organizationId: "org-1",
      canDeleteSigned: true,
    });

    expect(order).toEqual(["assets", "receipt"]);
    expect(result).toEqual({
      reference: "EPDA-RCV-2026-0001",
      assetsDeleted: 2,
    });
  });

  it("scopes both deletes to the workspace", async () => {
    receiptFindFirst.mockResolvedValue(receiptWith(["كرسي"]));

    await deleteGoodsReceipt({
      id: "r-1",
      organizationId: "org-1",
      canDeleteSigned: true,
    });

    expect(assetDeleteMany.mock.calls[0][0].where.organizationId).toBe("org-1");
    expect(receiptDeleteMany.mock.calls[0][0].where).toEqual({
      id: "r-1",
      organizationId: "org-1",
    });
  });

  it("erases a receipt that produced nothing without touching assets", async () => {
    receiptFindFirst.mockResolvedValue({
      id: "r-1",
      reference: "EPDA-RCV-2026-0002",
      state: "SAVED",
      lines: [],
    });

    const result = await deleteGoodsReceipt({
      id: "r-1",
      organizationId: "org-1",
      canDeleteSigned: true,
    });

    expect(assetDeleteMany).not.toHaveBeenCalled();
    expect(result.assetsDeleted).toBe(0);
  });

  describe("the signature rule", () => {
    // المستودعات may undo their own data entry; erasing a document three people
    // signed is المخزون's authority. The service must enforce it — the button
    // being hidden is a courtesy, not the gate.
    it("refuses a signed receipt when the caller may not erase signed ones", async () => {
      receiptFindFirst.mockResolvedValue(receiptWith(["كرسي"], "SIGNED"));

      await expect(
        deleteGoodsReceipt({
          id: "r-1",
          organizationId: "org-1",
          canDeleteSigned: false,
        }),
      ).rejects.toMatchObject({ status: 403 });

      expect(transaction).not.toHaveBeenCalled();
      expect(assetDeleteMany).not.toHaveBeenCalled();
    });

    it("allows an unsigned receipt for that same caller", async () => {
      receiptFindFirst.mockResolvedValue(receiptWith(["كرسي"], "SAVED"));

      await expect(
        deleteGoodsReceipt({
          id: "r-1",
          organizationId: "org-1",
          canDeleteSigned: false,
        }),
      ).resolves.toMatchObject({ reference: "EPDA-RCV-2026-0001" });
    });

    it("allows a voided receipt for that same caller", async () => {
      // Cancelled is not signed: the document was called off, and undoing it
      // is the same act as undoing an unsigned one.
      receiptFindFirst.mockResolvedValue(receiptWith(["كرسي"], "VOIDED"));

      await expect(
        deleteGoodsReceipt({
          id: "r-1",
          organizationId: "org-1",
          canDeleteSigned: false,
        }),
      ).resolves.toBeTruthy();
    });

    it("allows a signed receipt when the caller may erase signed ones", async () => {
      receiptFindFirst.mockResolvedValue(receiptWith(["كرسي"], "SIGNED"));

      await expect(
        deleteGoodsReceipt({
          id: "r-1",
          organizationId: "org-1",
          canDeleteSigned: true,
        }),
      ).resolves.toBeTruthy();
    });

    it("checks movement before signatures", async () => {
      // An item that moved is refused whoever asks — the 409 is the stronger
      // statement and must not be masked by the 403.
      receiptFindFirst.mockResolvedValue(receiptWith(["لابتوب"], "SIGNED"));
      assetFindMany.mockResolvedValue([{ title: "لابتوب" }]);

      await expect(
        deleteGoodsReceipt({
          id: "r-1",
          organizationId: "org-1",
          canDeleteSigned: false,
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  it("refuses a receipt that is not in this workspace", async () => {
    receiptFindFirst.mockResolvedValue(null);

    await expect(
      deleteGoodsReceipt({
        id: "elsewhere",
        organizationId: "org-1",
        canDeleteSigned: true,
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(transaction).not.toHaveBeenCalled();
  });
});
