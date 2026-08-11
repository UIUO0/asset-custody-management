/**
 * The coding/approval relay backlog.
 *
 * These counts drive sidebar badges, which makes their failure mode unusually
 * quiet: a query that is subtly too wide sends somebody hunting for work that
 * is not there, and one that is too narrow leaves a delivery finished but
 * unreleased with nothing on screen to say so. Neither shows up as an error.
 *
 * So the assertions are on the `where` clauses rather than on returned numbers —
 * the numbers come from Postgres, the *questions* come from this module.
 *
 * @see {@link file://./action-queue.server.ts}
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// why: the module is two `count` calls around the rules being tested; mocking
// the client keeps those rules testable without a database.
const assetCount = vi.fn();
vi.mock("~/database/db.server", () => ({
  db: { asset: { count: (...args: unknown[]) => assetCount(...args) } },
}));

const { getAssetActionQueue } = await import("./action-queue.server");

beforeEach(() => {
  assetCount.mockReset();
  assetCount.mockResolvedValue(0);
});

/** The `where` of the nth `count` call. */
const whereOf = (n: number) => assetCount.mock.calls[n][0].where;

describe("getAssetActionQueue", () => {
  it("asks nothing at all for a viewer on neither side", async () => {
    // This runs in the root layout loader, on every authenticated page load.
    // An employee must not pay for two counts nobody will show them.
    await expect(
      getAssetActionQueue({
        organizationId: "org-1",
        canCode: false,
        canApprove: false,
      }),
    ).resolves.toEqual({ awaitingFinanceCode: 0, awaitingApproval: 0 });

    expect(assetCount).not.toHaveBeenCalled();
  });

  it("skips the approval count for a coder", async () => {
    await getAssetActionQueue({
      organizationId: "org-1",
      canCode: true,
      canApprove: false,
    });

    expect(assetCount).toHaveBeenCalledTimes(1);
  });

  it("skips the coding count for an approver", async () => {
    await getAssetActionQueue({
      organizationId: "org-1",
      canCode: false,
      canApprove: true,
    });

    expect(assetCount).toHaveBeenCalledTimes(1);
  });

  describe("the coding queue", () => {
    beforeEach(async () => {
      await getAssetActionQueue({
        organizationId: "org-1",
        canCode: true,
        canApprove: false,
      });
    });

    it("counts أصول only", () => {
      // مواد are expensed on issue and never coded. Counting them would hand
      // المالية a queue they can never empty.
      expect(whereOf(0).itemClass).toBe("ASSET");
    });

    it("treats a cleared code as uncoded", () => {
      // Clearing writes "" rather than null, so a null-only test would read a
      // cleared code as present and quietly shrink the badge.
      expect(whereOf(0).OR).toEqual([
        { financeCode: null },
        { financeCode: "" },
      ]);
    });

    it("ignores items from a cancelled receipt", () => {
      expect(whereOf(0).receiptLine.receipt.state).toEqual({ not: "VOIDED" });
    });

    it("stays inside the workspace", () => {
      expect(whereOf(0).organizationId).toBe("org-1");
      expect(whereOf(0).receiptLine.receipt.organizationId).toBe("org-1");
    });
  });

  describe("the approval queue", () => {
    beforeEach(async () => {
      await getAssetActionQueue({
        organizationId: "org-1",
        canCode: false,
        canApprove: true,
      });
    });

    it("counts only items still awaiting approval", () => {
      expect(whereOf(0).lifecycleStage).toBe("PENDING");
    });

    it("counts only items the baton has actually reached", () => {
      // An item still waiting on المالية is not المستودعات' backlog. Telling
      // them about it would make the badge a number they cannot act on.
      expect(whereOf(0).NOT).toEqual({
        OR: [{ financeCode: null }, { financeCode: "" }],
      });
    });

    it("ignores items from a cancelled receipt", () => {
      expect(whereOf(0).receiptLine.receipt.state).toEqual({ not: "VOIDED" });
    });
  });

  it("returns both counts when the viewer can do both", async () => {
    assetCount.mockResolvedValueOnce(3).mockResolvedValueOnce(7);

    await expect(
      getAssetActionQueue({
        organizationId: "org-1",
        canCode: true,
        canApprove: true,
      }),
    ).resolves.toEqual({ awaitingFinanceCode: 3, awaitingApproval: 7 });
  });
});
