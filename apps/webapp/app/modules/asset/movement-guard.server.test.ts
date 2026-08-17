/**
 * The guard that keeps a signed محضر from losing lines.
 *
 * The property under test is narrow and load-bearing: an asset that someone is
 * holding, or that is named on a handover, must not be erasable — because both
 * relations cascade on `assetId` and would take the row out of the document
 * without touching its signatures.
 *
 * @see {@link file://./movement-guard.server.ts}
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const assetFindMany = vi.fn();

// why: the guard is one query plus a decision; mocking the client is what lets
// the decision be tested without a database.
vi.mock("~/database/db.server", () => ({
  db: { asset: { findMany: (...a: unknown[]) => assetFindMany(...a) } },
}));

const { assertAssetsHaveNotMoved, assetsMovedMessage } = await import(
  "./movement-guard.server"
);

beforeEach(() => {
  vi.clearAllMocks();
  assetFindMany.mockResolvedValue([]);
});

describe("assertAssetsHaveNotMoved", () => {
  it("passes when nothing has moved", async () => {
    await expect(
      assertAssetsHaveNotMoved({
        scope: { id: "a-1" },
        organizationId: "org-1",
        message: assetsMovedMessage,
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses with 409 when something has", async () => {
    assetFindMany.mockResolvedValue([{ title: "لابتوب" }]);

    await expect(
      assertAssetsHaveNotMoved({
        scope: { id: "a-1" },
        organizationId: "org-1",
        message: assetsMovedMessage,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("names what moved, so the operator knows what to unwind", async () => {
    assetFindMany.mockResolvedValue([{ title: "لابتوب" }, { title: "كرسي" }]);

    await expect(
      assertAssetsHaveNotMoved({
        scope: { id: "a-1" },
        organizationId: "org-1",
        message: assetsMovedMessage,
      }),
    ).rejects.toThrow(/لابتوب، كرسي/);
  });

  it("tests custody and handovers, both", async () => {
    // Custody alone would miss an item named on a محضر that has not been
    // signed yet — and erasing that still shortens the document.
    await assertAssetsHaveNotMoved({
      scope: { id: "a-1" },
      organizationId: "org-1",
      message: assetsMovedMessage,
    });

    expect(assetFindMany.mock.calls[0][0].where.OR).toEqual([
      { custody: { some: {} } },
      { custodyHandovers: { some: {} } },
    ]);
  });

  it("always scopes to the workspace, whatever the caller passed", async () => {
    await assertAssetsHaveNotMoved({
      // A caller trying to widen the search cannot escape the workspace.
      scope: { id: "a-1", organizationId: "other-org" },
      organizationId: "org-1",
      message: assetsMovedMessage,
    });

    expect(assetFindMany.mock.calls[0][0].where.organizationId).toBe("org-1");
  });

  it("caps the names it lists", async () => {
    await assertAssetsHaveNotMoved({
      scope: {},
      organizationId: "org-1",
      message: assetsMovedMessage,
    });

    expect(assetFindMany.mock.calls[0][0].take).toBe(10);
  });
});
