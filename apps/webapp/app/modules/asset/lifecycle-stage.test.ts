/**
 * The signature gate on single-asset approval.
 *
 * `updateAssetLifecycleStage` is the door the **asset page** approves through.
 * Until 2026-08-10 it did not call `assertReceiptSignedBeforeApproval` at all,
 * while the index's bulk action did — so the same item could be refused from
 * one screen and released from another, and the bulk path's comment claimed to
 * be "the single chokepoint every approval passes through" while it was not.
 *
 * Kept out of `service.server.test.ts` deliberately: that file is currently
 * unrunnable (it imports the kit service, which is being removed in a separate
 * change), and a rule about what may enter circulation should not be
 * unverifiable because an unrelated module is mid-demolition.
 *
 * @see {@link file://./service.server.ts} `updateAssetLifecycleStage`
 * @see {@link file://./../goods-receipt/receipt-gate.server.ts}
 */

import { AssetLifecycleStage } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// why: the function under test is a single `findFirst` + `update` around the
// rule being tested; mocking the client keeps the rule testable without a
// database. Only the delegates this path touches are implemented.
vi.mock("~/database/db.server", () => ({
  db: {
    asset: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: { findUniqueOrThrow: vi.fn() },
    note: { create: vi.fn(), createMany: vi.fn() },
  },
}));

// why: the gate has its own tests and its own database reads. What this file
// pins is whether this door *reaches* it, and on which transitions — so it is
// stubbed and the assertions are about the call, not the query behind it.
const assertReceiptSignedBeforeApproval = vi.fn();
vi.mock("~/modules/goods-receipt/receipt-gate.server", () => ({
  assertReceiptSignedBeforeApproval: (...args: unknown[]) =>
    assertReceiptSignedBeforeApproval(...args),
}));

// why: the note writer is a separate concern with its own tests, and letting it
// run here would only re-exercise its own database mocks.
vi.mock("~/modules/note/service.server", () => ({
  createNote: vi.fn().mockResolvedValue(undefined),
  createNotes: vi.fn().mockResolvedValue(undefined),
  createAssetQuantityChangeNote: vi.fn().mockResolvedValue(undefined),
  createAssetValuationChangeNote: vi.fn().mockResolvedValue(undefined),
}));

const { db } = await import("~/database/db.server");
const { updateAssetLifecycleStage } = await import("./service.server");

const mocked = db as unknown as {
  asset: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  user: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
};

const baseArgs = {
  id: "asset-1",
  organizationId: "org-1",
  userId: "user-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  assertReceiptSignedBeforeApproval.mockResolvedValue(undefined);
  mocked.asset.update.mockResolvedValue({});
  mocked.user.findUniqueOrThrow.mockResolvedValue({
    id: "user-1",
    firstName: "John",
    lastName: "Doe",
  });
});

/** Puts the asset in the stage the transition starts from. */
function assetAt(stage: AssetLifecycleStage) {
  mocked.asset.findFirst.mockResolvedValue({
    id: "asset-1",
    title: "Laptop",
    lifecycleStage: stage,
  });
}

describe("updateAssetLifecycleStage — receipt signature gate", () => {
  it("checks the signatures before releasing an item into circulation", async () => {
    assetAt(AssetLifecycleStage.PENDING);

    await updateAssetLifecycleStage({
      ...baseArgs,
      stage: AssetLifecycleStage.READY,
    });

    expect(assertReceiptSignedBeforeApproval).toHaveBeenCalledWith({
      assetIds: ["asset-1"],
      organizationId: "org-1",
    });
  });

  it("does not write the stage when the gate refuses", async () => {
    // The point of the gate: an unsigned delivery's items stay out of
    // circulation. A check that ran but let the write through anyway would be
    // worse than no check, because the screen would say it succeeded.
    assetAt(AssetLifecycleStage.PENDING);
    assertReceiptSignedBeforeApproval.mockRejectedValue(
      new Error("النموذج غير موقّع"),
    );

    await expect(
      updateAssetLifecycleStage({
        ...baseArgs,
        stage: AssetLifecycleStage.READY,
      }),
    ).rejects.toThrow();

    expect(mocked.asset.update).not.toHaveBeenCalled();
  });

  it("leaves a send-back ungated", async () => {
    // A send-back pulls an item *out* of circulation. Gating it on a signature
    // would trap an item approved by mistake exactly where it must not be.
    assetAt(AssetLifecycleStage.READY);

    await updateAssetLifecycleStage({
      ...baseArgs,
      stage: AssetLifecycleStage.PENDING,
      reason: "Missing financial coding",
    });

    expect(assertReceiptSignedBeforeApproval).not.toHaveBeenCalled();
    expect(mocked.asset.update).toHaveBeenCalled();
  });

  it("still couples approval to booking availability", async () => {
    // Guards the pre-existing contract against the gate being added above it:
    // approval releases the item AND opens it for booking, in one write.
    assetAt(AssetLifecycleStage.PENDING);

    await updateAssetLifecycleStage({
      ...baseArgs,
      stage: AssetLifecycleStage.READY,
    });

    expect(mocked.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lifecycleStage: AssetLifecycleStage.READY,
          availableToBook: true,
        },
      }),
    );
  });
});
