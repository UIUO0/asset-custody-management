/**
 * Custody handover service tests.
 *
 * These pin the properties the feature exists to guarantee, not the shape of
 * the code that provides them:
 *
 * 1. The party mapping inverts between تسليم and استرجاع.
 * 2. A signature payload that is not a plain PNG data URL is rejected.
 * 3. A handover cannot be opened against an asset whose custody state
 *    contradicts the requested direction.
 * 4. A return must name the person actually holding the asset.
 * 5. Completing a record writes the custody change — and completing a return
 *    removes it.
 *
 * Property 4 is the one worth guarding hardest: without it an operator could
 * file a return against the wrong employee, clearing the real custodian's
 * responsibility while producing a محضر that reads as if they had returned it.
 *
 * @see {@link file://./handover.server.ts}
 */

import {
  AssetStatus,
  CustodyHandoverKind,
  CustodyHandoverParty,
  CustodyHandoverState,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// why: the service talks to Postgres and Supabase Storage; neither is available
// in the unit-test environment and neither is the behaviour under test here.
vi.mock("~/database/db.server", () => ({
  db: {
    $transaction: vi.fn(),
    asset: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    custody: { deleteMany: vi.fn(), findFirst: vi.fn() },
    custodyHandover: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
    custodyHandoverSignature: { create: vi.fn(), count: vi.fn() },
    // why: the service reads team members with `findFirst`, not `findUnique` —
    // it scopes every lookup by `organizationId` as well as `id`, which is not
    // a unique compound and so cannot go through `findUnique`.
    teamMember: { findFirst: vi.fn() },
    // why: `resolveOwnDepartmentId` reads the caller's membership to find the
    // department desk they speak for. Without this the signature queue throws
    // instead of returning a count.
    userOrganization: { findFirst: vi.fn() },
  },
}));

// why: Supabase Storage is an external network dependency.
vi.mock("~/integrations/supabase/client", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        createSignedUrl: vi
          .fn()
          .mockResolvedValue({ data: { signedUrl: "https://signed.test/x" } }),
      }),
    },
  }),
}));

// why: activity events and notes are separate concerns with their own tests;
// letting them run here would only re-exercise their database mocks.
vi.mock("~/modules/activity-event/service.server", () => ({
  recordEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/modules/note/service.server", () => ({
  createNote: vi.fn().mockResolvedValue(undefined),
}));

const { db } = await import("~/database/db.server");
const {
  applyHandoverEffect,
  countHandoversAwaitingMySignature,
  decodeSignatureDataUrl,
  openHandover,
  openReturnRequest,
} = await import("./handover.server");
// Pure logic lives in the neutral module so route components can render from
// it — see the docblock there.
const { partyFor, resolveSignableParty } = await import("./handover");

/** Runs a `$transaction` callback against a supplied fake client. */
function runTransactionWith(tx: unknown) {
  // The mock is already `any`-shaped, so no directive is needed here — the fake
  // client only implements the handful of models the code under test touches.
  (db.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (callback: (client: unknown) => unknown) => callback(tx),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("partyFor", () => {
  it("puts the warehouse on the releasing side of a handover", () => {
    expect(partyFor(CustodyHandoverKind.HANDOVER, "warehouse")).toBe(
      CustodyHandoverParty.RELEASING,
    );
    expect(partyFor(CustodyHandoverKind.HANDOVER, "counterparty")).toBe(
      CustodyHandoverParty.RECEIVING,
    );
  });

  it("swaps the sides on a return", () => {
    expect(partyFor(CustodyHandoverKind.RETURN, "warehouse")).toBe(
      CustodyHandoverParty.RECEIVING,
    );
    expect(partyFor(CustodyHandoverKind.RETURN, "counterparty")).toBe(
      CustodyHandoverParty.RELEASING,
    );
  });

  it("never assigns both parties to the same side", () => {
    for (const kind of [
      CustodyHandoverKind.HANDOVER,
      CustodyHandoverKind.RETURN,
    ]) {
      expect(partyFor(kind, "warehouse")).not.toBe(
        partyFor(kind, "counterparty"),
      );
    }
  });
});

describe("decodeSignatureDataUrl", () => {
  // A 1x1 transparent PNG.
  const validPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  it("accepts a PNG data URL", () => {
    expect(decodeSignatureDataUrl(validPng).byteLength).toBeGreaterThan(0);
  });

  it("rejects a JPEG data URL", () => {
    expect(() =>
      decodeSignatureDataUrl("data:image/jpeg;base64,/9j/4AAQSkZJRg=="),
    ).toThrow();
  });

  it("rejects an SVG payload", () => {
    // SVG can carry script. Accepting it would turn the signature bucket into
    // a stored-XSS vector the moment an image is rendered inline.
    expect(() =>
      decodeSignatureDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="),
    ).toThrow();
  });

  it("rejects an empty payload", () => {
    expect(() => decodeSignatureDataUrl("data:image/png;base64,")).toThrow();
  });

  it("rejects a payload past the size cap", () => {
    const oversized = `data:image/png;base64,${"A".repeat(1_000_000)}`;
    expect(() => decodeSignatureDataUrl(oversized)).toThrow();
  });
});

describe("openHandover", () => {
  const base = {
    assets: [{ id: "asset-1" }],
    organizationId: "org-1",
    counterpartyTeamMemberId: "tm-1",
    operatorUserId: "user-1",
  };

  it("refuses a handover for an asset already in custody", async () => {
    runTransactionWith({
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "asset-1",
            title: "Laptop",
            type: "INDIVIDUAL",
            quantity: null,
            custody: [{ id: "c-1", teamMemberId: "tm-9", quantity: 1 }],
          },
        ]),
      },
      custodyHandover: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    });

    await expect(
      openHandover({ ...base, kind: CustodyHandoverKind.HANDOVER }),
    ).rejects.toThrow(/already in someone's custody/i);
  });

  it("refuses a return for an asset nobody holds", async () => {
    runTransactionWith({
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "asset-1",
            title: "Laptop",
            type: "INDIVIDUAL",
            quantity: null,
            custody: [],
          },
        ]),
      },
      custodyHandover: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    });

    await expect(
      openHandover({ ...base, kind: CustodyHandoverKind.RETURN }),
    ).rejects.toThrow(/nothing to return/i);
  });

  it("refuses a return that names someone other than the current custodian", async () => {
    runTransactionWith({
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "asset-1",
            title: "Laptop",
            type: "INDIVIDUAL",
            quantity: null,
            custody: [
              { id: "c-1", teamMemberId: "tm-actual-holder", quantity: 1 },
            ],
          },
        ]),
      },
      custodyHandover: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    });

    await expect(
      openHandover({
        ...base,
        counterpartyTeamMemberId: "tm-someone-else",
        kind: CustodyHandoverKind.RETURN,
      }),
    ).rejects.toThrow(/different team member/i);
  });

  it("voids any earlier record still awaiting signatures", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    runTransactionWith({
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "asset-1",
            title: "Laptop",
            type: "INDIVIDUAL",
            quantity: null,
            custody: [],
          },
        ]),
      },
      custodyHandover: {
        updateMany,
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: "ho-1", reference: "R" }),
      },
    });

    await openHandover({ ...base, kind: CustodyHandoverKind.HANDOVER });

    expect(updateMany).toHaveBeenCalledOnce();
  });
});

describe("openReturnRequest", () => {
  const base = {
    assetId: "asset-1",
    organizationId: "org-1",
    userId: "user-1",
    requestReason: "انتهى المشروع",
  };

  /** Wires the module-level mocks for one scenario. */
  function arrange({
    member,
    custody,
  }: {
    member: { id: string } | null;
    custody: { id: string } | null;
  }) {
    const mock = db as unknown as Record<
      string,
      Record<string, ReturnType<typeof vi.fn>>
    >;
    mock.teamMember.findFirst.mockResolvedValue(member);
    mock.custody.findFirst.mockResolvedValue(custody);
    mock.custodyHandover.findFirst.mockResolvedValue(null);
  }

  it("refuses a caller who does not hold the asset", async () => {
    // The authorization model in one test: not a role, a fact. A user who is
    // not the custodian cannot file a return against the asset even though
    // `asset.read` — the route's gate — is held by everyone.
    arrange({ member: { id: "tm-1" }, custody: null });

    await expect(openReturnRequest(base)).rejects.toThrow(
      /only request the return of an asset that is currently in your custody/i,
    );
  });

  it("refuses a caller with no team-member row", async () => {
    arrange({ member: null, custody: null });

    await expect(openReturnRequest(base)).rejects.toThrow(/your custody/i);
  });

  it("requires a reason", async () => {
    // Checked before the custody lookup: an empty reason is rejected without
    // revealing whether the asset exists or who holds it.
    await expect(
      openReturnRequest({ ...base, requestReason: "  " }),
    ).rejects.toThrow(/why you are returning/i);
  });

  it("returns the existing record instead of opening a second one", async () => {
    // Idempotence matters here specifically: `openHandover` voids earlier open
    // records, so a double-tap would otherwise silently discard a محضر the
    // warehouse may already have half-signed.
    const mock = db as unknown as Record<
      string,
      Record<string, ReturnType<typeof vi.fn>>
    >;
    mock.teamMember.findFirst.mockResolvedValue({ id: "tm-1" });
    mock.custody.findFirst.mockResolvedValue({ id: "c-1" });
    mock.custodyHandover.findFirst.mockResolvedValue({
      id: "ho-existing",
      signatures: [],
    });

    const result = await openReturnRequest(base);

    expect(result).toMatchObject({ id: "ho-existing" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("countHandoversAwaitingMySignature", () => {
  it("counts a record an employee signed and the desk has not", async () => {
    // The regression this exists for: an employee-initiated return sat signed
    // and invisible, because the badge only ever counted the employee side.
    // The warehouse was the blocking party and nothing told them so.
    const mock = db as unknown as Record<
      string,
      Record<string, ReturnType<typeof vi.fn>>
    >;
    mock.teamMember.findFirst.mockResolvedValue({ id: "tm-operator" });
    mock.custodyHandover.findMany.mockResolvedValue([
      {
        kind: CustodyHandoverKind.RETURN,
        counterpartyTeamMemberId: "tm-employee",
        // On a return the employee holds RELEASING; the desk's RECEIVING is
        // still open.
        signatures: [{ party: CustodyHandoverParty.RELEASING }],
      },
    ]);

    await expect(
      countHandoversAwaitingMySignature({
        userId: "user-operator",
        organizationId: "org-1",
        canOperate: true,
      }),
    ).resolves.toBe(1);
  });

  it("does not count that record for an ordinary employee", async () => {
    const mock = db as unknown as Record<
      string,
      Record<string, ReturnType<typeof vi.fn>>
    >;
    mock.teamMember.findFirst.mockResolvedValue({ id: "tm-employee" });
    mock.custodyHandover.findMany.mockResolvedValue([
      {
        kind: CustodyHandoverKind.RETURN,
        counterpartyTeamMemberId: "tm-employee",
        signatures: [{ party: CustodyHandoverParty.RELEASING }],
      },
    ]);

    await expect(
      countHandoversAwaitingMySignature({
        userId: "user-employee",
        organizationId: "org-1",
        canOperate: false,
      }),
    ).resolves.toBe(0);
  });
});

describe("resolveSignableParty", () => {
  const open = (overrides: Record<string, unknown> = {}) => ({
    kind: CustodyHandoverKind.HANDOVER,
    state: CustodyHandoverState.AWAITING_SIGNATURES,
    counterpartyTeamMemberId: "tm-employee",
    signatures: [] as { party: CustodyHandoverParty }[],
    ...overrides,
  });

  it("lets the named employee sign their own slot", () => {
    expect(
      resolveSignableParty({
        handover: open(),
        canOperate: false,
        ownTeamMemberId: "tm-employee",
      }),
    ).toBe(CustodyHandoverParty.RECEIVING);
  });

  it("refuses an employee who is not the named counterparty", () => {
    // The whole point of remote signing's security model: an employee cannot
    // sign somebody else's handover by guessing its id.
    expect(
      resolveSignableParty({
        handover: open(),
        canOperate: false,
        ownTeamMemberId: "tm-someone-else",
      }),
    ).toBeNull();
  });

  it("does not let an operator sign the employee's slot", () => {
    // The failure mode remote signing invites: an operator opens a record
    // naming an employee, then signs both halves from their own account and
    // produces a fully executed محضر that is entirely fabricated.
    const warehouseDone = open({
      signatures: [{ party: CustodyHandoverParty.RELEASING }],
    });

    expect(
      resolveSignableParty({
        handover: warehouseDone,
        canOperate: true,
        ownTeamMemberId: "tm-operator",
      }),
    ).toBeNull();
  });

  it("gives an operator who is also the counterparty the employee slot", () => {
    // A warehouse officer taking an asset out for themselves signs as the
    // employee, not as the desk — otherwise their own custody would rest on
    // the desk signature alone.
    expect(
      resolveSignableParty({
        handover: open({ counterpartyTeamMemberId: "tm-operator" }),
        canOperate: true,
        ownTeamMemberId: "tm-operator",
      }),
    ).toBe(CustodyHandoverParty.RECEIVING);
  });

  it("does not let that same operator then sign the desk's slot", () => {
    // The other half of the same trap. The operator above signed as the
    // employee; nothing may now offer them the warehouse slot, or one person
    // would have executed both halves of a محضر and the second signature — the
    // one that actually moves custody — would witness nothing.
    expect(
      resolveSignableParty({
        handover: open({
          counterpartyTeamMemberId: "tm-operator",
          signatures: [{ party: CustodyHandoverParty.RECEIVING }],
        }),
        canOperate: true,
        ownTeamMemberId: "tm-operator",
      }),
    ).toBeNull();
  });

  it("still lets a different operator countersign that record", () => {
    // The rule constrains who may sign, not whether the record can complete:
    // any other holder of `asset.custody` closes it.
    expect(
      resolveSignableParty({
        handover: open({
          counterpartyTeamMemberId: "tm-operator",
          signatures: [{ party: CustodyHandoverParty.RECEIVING }],
        }),
        canOperate: true,
        ownTeamMemberId: "tm-other-operator",
      }),
    ).toBe(CustodyHandoverParty.RELEASING);
  });

  it("refuses everyone once the record is closed", () => {
    for (const state of [
      CustodyHandoverState.COMPLETED,
      CustodyHandoverState.VOIDED,
    ]) {
      expect(
        resolveSignableParty({
          handover: open({ state }),
          canOperate: true,
          ownTeamMemberId: "tm-employee",
        }),
      ).toBeNull();
    }
  });

  it("refuses a second signature from the same side", () => {
    expect(
      resolveSignableParty({
        handover: open({
          signatures: [{ party: CustodyHandoverParty.RECEIVING }],
        }),
        canOperate: false,
        ownTeamMemberId: "tm-employee",
      }),
    ).toBeNull();
  });

  it("maps the employee to the releasing slot on a return", () => {
    expect(
      resolveSignableParty({
        handover: open({ kind: CustodyHandoverKind.RETURN }),
        canOperate: false,
        ownTeamMemberId: "tm-employee",
      }),
    ).toBe(CustodyHandoverParty.RELEASING);
  });
});

/**
 * The custody writes a completed محضر performs.
 *
 * These assert on the `Custody` table rather than on `Asset.status`, because
 * the status is a summary and the table is the fact. Partial movement is the
 * property worth guarding: a department handing on 10 of its 30 pens must keep
 * 20, and a `deleteMany` would silently return those 20 to the shelf with the
 * only trace being a stock count that stopped adding up.
 */
describe("applyHandoverEffect", () => {
  /** A transaction fake that records what it was asked to write. */
  function makeTx(
    custodyRow: { id: string; quantity: number } | null = null,
    stillOut = 0,
  ) {
    return {
      asset: { update: vi.fn().mockResolvedValue({}) },
      custody: {
        findFirst: vi.fn().mockResolvedValue(custodyRow),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(stillOut),
      },
      teamMember: { findFirst: vi.fn().mockResolvedValue({ id: "tm-1" }) },
    };
  }

  function run(
    tx: unknown,
    overrides: Partial<{
      kind: CustodyHandoverKind;
      assets: { assetId: string; quantity?: number }[];
      releasingTeamMemberId: string | null;
    }> = {},
  ) {
    return applyHandoverEffect(
      {
        id: "ho-1",
        kind: CustodyHandoverKind.HANDOVER,
        assets: [{ assetId: "a-1", quantity: 1 }],
        organizationId: "org-1",
        counterpartyTeamMemberId: "tm-1",
        operatorUserId: "user-1",
        ...overrides,
      },
      // @ts-expect-error -- partial transaction client, see runTransactionWith
      tx,
    );
  }

  it("creates custody for the units the محضر lists", async () => {
    const tx = makeTx();
    await run(tx, { assets: [{ assetId: "a-1", quantity: 30 }] });

    expect(tx.custody.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: 30, teamMemberId: "tm-1" }),
      }),
    );
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AssetStatus.IN_CUSTODY }),
      }),
    );
  });

  it("adds to an existing holding rather than replacing it", async () => {
    // why: an employee holding 5 who signs for 10 more holds 15, not 10.
    const tx = makeTx({ id: "c-1", quantity: 5 });
    await run(tx, { assets: [{ assetId: "a-1", quantity: 10 }] });

    expect(tx.custody.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { increment: 10 } } }),
    );
    expect(tx.custody.create).not.toHaveBeenCalled();
  });

  it("leaves the remainder with a department that hands on part of its stock", async () => {
    const tx = makeTx({ id: "c-dept", quantity: 30 });
    await run(tx, {
      assets: [{ assetId: "a-1", quantity: 10 }],
      releasingTeamMemberId: "tm-dept",
    });

    // 30 − 10 = 20 stay with the desk; the row is updated, never deleted.
    expect(tx.custody.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 20 } }),
    );
    expect(tx.custody.delete).not.toHaveBeenCalled();
  });

  it("removes the releasing row when it hands on everything", async () => {
    const tx = makeTx({ id: "c-dept", quantity: 10 });
    await run(tx, {
      assets: [{ assetId: "a-1", quantity: 10 }],
      releasingTeamMemberId: "tm-dept",
    });

    expect(tx.custody.delete).toHaveBeenCalledWith({ where: { id: "c-dept" } });
  });

  it("frees the asset when a return takes back the last units", async () => {
    const tx = makeTx({ id: "c-1", quantity: 5 }, 0);
    await run(tx, {
      kind: CustodyHandoverKind.RETURN,
      assets: [{ assetId: "a-1", quantity: 5 }],
    });

    expect(tx.custody.delete).toHaveBeenCalled();
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AssetStatus.AVAILABLE }),
      }),
    );
  });

  it("keeps the asset IN_CUSTODY when a partial return leaves units out", async () => {
    // why: flipping to AVAILABLE while units are still held is what lets a
    // second handover over-allocate the same stock.
    const tx = makeTx({ id: "c-1", quantity: 30 }, 1);
    await run(tx, {
      kind: CustodyHandoverKind.RETURN,
      assets: [{ assetId: "a-1", quantity: 10 }],
    });

    expect(tx.custody.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 20 } }),
    );
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AssetStatus.IN_CUSTODY }),
      }),
    );
  });

  it("applies every line of a batch, not just the first", async () => {
    const tx = makeTx();
    await run(tx, {
      assets: [
        { assetId: "a-1", quantity: 1 },
        { assetId: "a-2", quantity: 1 },
        { assetId: "a-3", quantity: 1 },
      ],
    });

    expect(tx.custody.create).toHaveBeenCalledTimes(3);
  });
});

describe("openHandover — batch", () => {
  const base = {
    organizationId: "org-1",
    counterpartyTeamMemberId: "tm-facilities",
    operatorUserId: "user-1",
  };

  const freeAsset = (id: string) => ({
    id,
    title: id,
    type: "INDIVIDUAL" as const,
    quantity: null,
    custody: [],
  });

  it("puts every selected asset on one record with one reference", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: "ho-1", reference: "EPDA-HO-2026-0001" });
    runTransactionWith({
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue(["a-1", "a-2", "a-3"].map(freeAsset)),
      },
      custodyHandover: {
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create,
      },
    });

    await openHandover({
      ...base,
      assets: [{ id: "a-1" }, { id: "a-2" }, { id: "a-3" }],
      kind: CustodyHandoverKind.HANDOVER,
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data.assets.create).toEqual([
      { assetId: "a-1", quantity: 1 },
      { assetId: "a-2", quantity: 1 },
      { assetId: "a-3", quantity: 1 },
    ]);
  });

  it("rejects the whole batch when one asset is already in custody", async () => {
    const create = vi.fn();
    runTransactionWith({
      asset: {
        findMany: vi.fn().mockResolvedValue([
          freeAsset("a-1"),
          {
            id: "a-2",
            title: "Held laptop",
            type: "INDIVIDUAL" as const,
            quantity: null,
            custody: [{ id: "c-1", teamMemberId: "tm-9", quantity: 1 }],
          },
          freeAsset("a-3"),
        ]),
      },
      custodyHandover: { updateMany: vi.fn(), count: vi.fn(), create },
    });

    await expect(
      openHandover({
        ...base,
        assets: [{ id: "a-1" }, { id: "a-2" }, { id: "a-3" }],
        kind: CustodyHandoverKind.HANDOVER,
      }),
    ).rejects.toThrow(/already in someone's custody/i);

    // The two healthy assets must NOT have been handed over on their own.
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects the batch when an asset is not in the workspace", async () => {
    const create = vi.fn();
    runTransactionWith({
      // Only two of the three ids come back — the third belongs elsewhere.
      asset: {
        findMany: vi.fn().mockResolvedValue(["a-1", "a-2"].map(freeAsset)),
      },
      custodyHandover: { updateMany: vi.fn(), count: vi.fn(), create },
    });

    await expect(
      openHandover({
        ...base,
        assets: [{ id: "a-1" }, { id: "a-2" }, { id: "a-cross-org" }],
        kind: CustodyHandoverKind.HANDOVER,
      }),
    ).rejects.toThrow(/do not exist in your workspace/i);

    expect(create).not.toHaveBeenCalled();
  });

  it("refuses an empty selection instead of creating a blank محضر", async () => {
    await expect(
      openHandover({
        ...base,
        assets: [],
        kind: CustodyHandoverKind.HANDOVER,
      }),
    ).rejects.toThrow(/at least one asset/i);
  });

  it("sums a repeated asset into one line rather than tripping the unique index", async () => {
    const create = vi.fn().mockResolvedValue({ id: "ho-1", reference: "R" });
    runTransactionWith({
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a-1",
            title: "Pens",
            type: "QUANTITY_TRACKED" as const,
            quantity: 30,
            custody: [],
          },
        ]),
      },
      custodyHandover: {
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create,
      },
    });

    await openHandover({
      ...base,
      assets: [{ id: "a-1" }, { id: "a-1" }],
      kind: CustodyHandoverKind.HANDOVER,
    });

    // Repeated ids SUM: two lines of one unit is a request for two.
    expect(create.mock.calls[0][0].data.assets.create).toEqual([
      { assetId: "a-1", quantity: 2 },
    ]);
  });
});

describe("openHandover — department transfer", () => {
  const base = {
    organizationId: "org-1",
    counterpartyTeamMemberId: "tm-employee",
    operatorUserId: "user-1",
    assets: [{ id: "a-1" }],
    kind: CustodyHandoverKind.HANDOVER,
  };

  function heldBy(teamMemberId: string | null) {
    return {
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a-1",
            title: "Laptop",
            type: "INDIVIDUAL",
            quantity: null,
            custody: teamMemberId
              ? [{ id: "c-1", teamMemberId, quantity: 1 }]
              : [],
          },
        ]),
      },
      custodyHandover: {
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: "ho-1", reference: "R" }),
      },
    };
  }

  it("hands an asset the department holds on to an employee", async () => {
    const tx = heldBy("tm-facilities");
    runTransactionWith(tx);

    await openHandover({ ...base, releasingTeamMemberId: "tm-facilities" });

    expect(tx.custodyHandover.create).toHaveBeenCalledOnce();
  });

  it("refuses when the named desk is not the actual holder", async () => {
    // why: this is the tightening. Without it a department could name itself
    // as the releasing side and hand over stock another custodian is holding.
    const tx = heldBy("tm-someone-else");
    runTransactionWith(tx);

    await expect(
      openHandover({ ...base, releasingTeamMemberId: "tm-facilities" }),
    ).rejects.toThrow(/not yours to pass on/i);

    expect(tx.custodyHandover.create).not.toHaveBeenCalled();
  });

  it("refuses a transfer of an asset nobody holds", async () => {
    const tx = heldBy(null);
    runTransactionWith(tx);

    await expect(
      openHandover({ ...base, releasingTeamMemberId: "tm-facilities" }),
    ).rejects.toThrow(/not in anyone's custody/i);
  });

  it("refuses to hand an asset to the side already holding it", async () => {
    // why: both signature slots would belong to the same party, and the محضر
    // would record a movement that never happened.
    const tx = heldBy("tm-facilities");
    runTransactionWith(tx);

    await expect(
      openHandover({
        ...base,
        counterpartyTeamMemberId: "tm-facilities",
        releasingTeamMemberId: "tm-facilities",
      }),
    ).rejects.toThrow(/must be different/i);
  });

  it("still refuses an ordinary handover of a held asset", async () => {
    // why: the transfer path must not have weakened the default. Omitting
    // `releasingTeamMemberId` keeps the original rule.
    const tx = heldBy("tm-facilities");
    runTransactionWith(tx);

    await expect(openHandover(base)).rejects.toThrow(
      /already in someone's custody/i,
    );
  });
});

/**
 * Department officers signing on behalf of their desk.
 *
 * A batch محضر names `إدارة المرافق` — a TeamMember row with no user account —
 * so nobody's personal row ever equals the counterparty. Without this the
 * receiving department could never sign and every batch would stall.
 *
 * The tests below pin BOTH directions: they can sign their desk's half, and
 * widening "who is the counterparty" did **not** let them sign both halves.
 */
describe("resolveSignableParty — department desk", () => {
  const DESK = "tm-facilities";
  const OFFICER = "tm-officer";

  const batch = (signed: CustodyHandoverParty[] = []) => ({
    kind: CustodyHandoverKind.HANDOVER,
    state: CustodyHandoverState.AWAITING_SIGNATURES,
    counterpartyTeamMemberId: DESK,
    signatures: signed.map((party) => ({ party })),
  });

  it("lets an officer sign their desk's half of a batch محضر", () => {
    expect(
      resolveSignableParty({
        handover: batch([CustodyHandoverParty.RELEASING]),
        canOperate: true,
        ownTeamMemberId: OFFICER,
        ownDepartmentTeamMemberId: DESK,
      }),
    ).toBe(CustodyHandoverParty.RECEIVING);
  });

  it("does NOT let that officer also sign the warehouse half", () => {
    // why: this is the rule the widening could have broken. Being recognised
    // as the counterparty must return that slot and stop — a محضر signed by
    // one person on both sides witnesses nothing.
    expect(
      resolveSignableParty({
        handover: batch([CustodyHandoverParty.RECEIVING]),
        canOperate: true,
        ownTeamMemberId: OFFICER,
        ownDepartmentTeamMemberId: DESK,
      }),
    ).toBeNull();
  });

  it("gives nothing to someone from a different department", () => {
    expect(
      resolveSignableParty({
        handover: batch([CustodyHandoverParty.RELEASING]),
        canOperate: false,
        ownTeamMemberId: OFFICER,
        ownDepartmentTeamMemberId: "tm-some-other-desk",
      }),
    ).toBeNull();
  });

  it("still gives the warehouse slot to an operator with no department", () => {
    // Regression guard: the default must keep the pre-existing behaviour.
    expect(
      resolveSignableParty({
        handover: batch(),
        canOperate: true,
        ownTeamMemberId: "tm-warehouse",
      }),
    ).toBe(CustodyHandoverParty.RELEASING);
  });
});

/**
 * A محضر moves the whole line, so `Custody.quantity` must carry the asset's
 * full stock.
 *
 * `Custody.quantity` defaults to 1 in the schema. For a QUANTITY_TRACKED asset
 * — a receipt line of 30 pens is ONE asset with `quantity = 30` — that default
 * records the department receiving a single pen while 29 read as still on the
 * shelf. Nothing surfaces the discrepancy until someone counts.
 */

/**
 * Quantity limits on a محضر.
 *
 * A signed document that says 40 pens moved when only 30 exist is worse than a
 * rejected request: it is evidence of something that did not happen. These pin
 * the arithmetic the service refuses to skip.
 */
describe("openHandover — quantity limits", () => {
  const base = {
    organizationId: "org-1",
    counterpartyTeamMemberId: "tm-employee",
    operatorUserId: "user-1",
    kind: CustodyHandoverKind.HANDOVER,
  };

  function pens(custody: Array<{ teamMemberId: string; quantity: number }>) {
    const create = vi.fn().mockResolvedValue({ id: "ho-1", reference: "R" });
    return {
      create,
      tx: {
        asset: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "a-1",
              title: "أقلام",
              type: "QUANTITY_TRACKED" as const,
              quantity: 30,
              custody: custody.map((c, i) => ({ id: `c-${i}`, ...c })),
            },
          ]),
        },
        custodyHandover: {
          updateMany: vi.fn(),
          count: vi.fn().mockResolvedValue(0),
          create,
        },
      },
    };
  }

  it("hands over part of the stock and records that quantity", async () => {
    const { create, tx } = pens([]);
    runTransactionWith(tx);

    await openHandover({ ...base, assets: [{ id: "a-1", quantity: 10 }] });

    expect(create.mock.calls[0][0].data.assets.create).toEqual([
      { assetId: "a-1", quantity: 10 },
    ]);
  });

  it("refuses more units than the shelf holds", async () => {
    const { create, tx } = pens([]);
    runTransactionWith(tx);

    await expect(
      openHandover({ ...base, assets: [{ id: "a-1", quantity: 40 }] }),
    ).rejects.toThrow(/only 30 of 30 units are available/i);

    expect(create).not.toHaveBeenCalled();
  });

  it("counts units already out when computing what is available", async () => {
    // 30 total, 25 already with somebody else → 5 left, so 10 must fail.
    const { tx } = pens([{ teamMemberId: "tm-other", quantity: 25 }]);
    runTransactionWith(tx);

    await expect(
      openHandover({ ...base, assets: [{ id: "a-1", quantity: 10 }] }),
    ).rejects.toThrow(/only 5 .*available .*25 already in custody/i);
  });

  it("still allows a handover from stock that is only partly out", async () => {
    // why: "already in custody" is arithmetic for quantity-tracked assets, not
    // a yes/no gate — 20 pens remain on the shelf and may be issued.
    const { create, tx } = pens([{ teamMemberId: "tm-other", quantity: 10 }]);
    runTransactionWith(tx);

    await openHandover({ ...base, assets: [{ id: "a-1", quantity: 20 }] });

    expect(create).toHaveBeenCalledOnce();
  });

  it("refuses a transfer of more than the releasing side holds", async () => {
    const { create, tx } = pens([{ teamMemberId: "tm-dept", quantity: 30 }]);
    runTransactionWith(tx);

    await expect(
      openHandover({
        ...base,
        assets: [{ id: "a-1", quantity: 40 }],
        releasingTeamMemberId: "tm-dept",
      }),
    ).rejects.toThrow(/only 30 units are in your custody/i);

    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a quantity below one", async () => {
    const { tx } = pens([]);
    runTransactionWith(tx);

    await expect(
      openHandover({ ...base, assets: [{ id: "a-1", quantity: 0 }] }),
    ).rejects.toThrow(/at least 1/i);
  });

  it("refuses more than one unit of an individually-tracked asset", async () => {
    runTransactionWith({
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a-1",
            title: "لابتوب",
            type: "INDIVIDUAL" as const,
            quantity: null,
            custody: [],
          },
        ]),
      },
      custodyHandover: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    });

    await expect(
      openHandover({ ...base, assets: [{ id: "a-1", quantity: 3 }] }),
    ).rejects.toThrow(/tracked individually/i);
  });
});
