// @vitest-environment node
import type { ITXClientDenyList } from "@prisma/client/runtime/library";
import { describe, expect, it, vi } from "vitest";
import type { ExtendedPrismaClient } from "~/database/db.server";
import { transferEntitiesToNewOwner } from "./service.server";

// why: service.server.ts imports `db` from `~/database/db.server` at module
// scope, and that module calls `createDatabaseClient()` + `db.$connect()` as
// a side effect of being imported (app/database/db.server.ts). The function
// under test only ever touches the `tx` param passed in by its caller, so a
// stub is enough to keep this suite off a real Prisma client.
vi.mock("~/database/db.server", () => ({
  db: {},
}));

const TARGET = "user-target";
const RECIPIENT = "user-recipient";
const ORG = "org-1";

/**
 * Builds a fake transaction client exposing only the model methods
 * `transferEntitiesToNewOwner` calls, each spied with `vi.fn()` so a test
 * can assert on call shape without a real Prisma client.
 */
function createMockTx() {
  return {
    asset: { updateMany: vi.fn() },
    category: { updateMany: vi.fn() },
    location: { updateMany: vi.fn() },
    customField: { updateMany: vi.fn() },
    invite: { updateMany: vi.fn() },
    image: { updateMany: vi.fn() },
    assetReminder: { updateMany: vi.fn() },
  };
}

type MockTx = ReturnType<typeof createMockTx>;

/** Casts the fake tx to the type `transferEntitiesToNewOwner` requires. */
function asTx(tx: MockTx) {
  return tx as unknown as Omit<ExtendedPrismaClient, ITXClientDenyList>;
}

/**
 * Asserts the 6 OWNERSHIP rewrites (Asset/Category/Location/CustomField/
 * Image/AssetReminder) fired with the expected `where`/`data` shape.
 * These must move for every `reason` — shared between the demotion and
 * removal test groups below.
 */
function expectOwnershipTransferred(tx: MockTx) {
  expect(tx.asset.updateMany).toHaveBeenCalledWith({
    where: { userId: TARGET, organizationId: ORG },
    data: { userId: RECIPIENT },
  });
  expect(tx.category.updateMany).toHaveBeenCalledWith({
    where: { userId: TARGET, organizationId: ORG },
    data: { userId: RECIPIENT },
  });
  expect(tx.location.updateMany).toHaveBeenCalledWith({
    where: { userId: TARGET, organizationId: ORG },
    data: { userId: RECIPIENT },
  });
  expect(tx.customField.updateMany).toHaveBeenCalledWith({
    where: { userId: TARGET, organizationId: ORG },
    data: { userId: RECIPIENT },
  });
  expect(tx.image.updateMany).toHaveBeenCalledWith({
    // Image scopes on `ownerOrgId`, not `organizationId`.
    where: { userId: TARGET, ownerOrgId: ORG },
    data: { userId: RECIPIENT },
  });
  expect(tx.assetReminder.updateMany).toHaveBeenCalledWith({
    where: { createdById: TARGET, organizationId: ORG },
    data: { createdById: RECIPIENT },
  });
}

describe("transferEntitiesToNewOwner", () => {
  describe("reason: demotion", () => {
    it("leaves invites untouched", async () => {
      const tx = createMockTx();

      await transferEntitiesToNewOwner({
        tx: asTx(tx),
        id: TARGET,
        newOwnerId: RECIPIENT,
        organizationId: ORG,
        reason: "demotion",
      });

      expect(tx.invite.updateMany).not.toHaveBeenCalled();
    });

    it("still transfers all ownership columns", async () => {
      const tx = createMockTx();

      await transferEntitiesToNewOwner({
        tx: asTx(tx),
        id: TARGET,
        newOwnerId: RECIPIENT,
        organizationId: ORG,
        reason: "demotion",
      });

      expectOwnershipTransferred(tx);
    });
  });

  describe("reason: removal", () => {
    it("transfers invites", async () => {
      const tx = createMockTx();

      await transferEntitiesToNewOwner({
        tx: asTx(tx),
        id: TARGET,
        newOwnerId: RECIPIENT,
        organizationId: ORG,
        reason: "removal",
      });

      expect(tx.invite.updateMany).toHaveBeenCalledWith({
        where: { inviterId: TARGET, organizationId: ORG },
        data: { inviterId: RECIPIENT },
      });
    });

    it("still transfers all ownership columns", async () => {
      const tx = createMockTx();

      await transferEntitiesToNewOwner({
        tx: asTx(tx),
        id: TARGET,
        newOwnerId: RECIPIENT,
        organizationId: ORG,
        reason: "removal",
      });

      expectOwnershipTransferred(tx);
    });
  });
});
