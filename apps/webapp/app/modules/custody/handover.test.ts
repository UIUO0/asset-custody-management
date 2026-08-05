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
    asset: { findFirst: vi.fn(), update: vi.fn() },
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
    teamMember: { findUnique: vi.fn() },
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
    assetId: "asset-1",
    organizationId: "org-1",
    counterpartyTeamMemberId: "tm-1",
    operatorUserId: "user-1",
  };

  it("refuses a handover for an asset already in custody", async () => {
    runTransactionWith({
      asset: {
        findFirst: vi.fn().mockResolvedValue({
          id: "asset-1",
          title: "Laptop",
          custody: [{ id: "c-1", teamMemberId: "tm-9" }],
        }),
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
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "asset-1", title: "Laptop", custody: [] }),
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
        findFirst: vi.fn().mockResolvedValue({
          id: "asset-1",
          title: "Laptop",
          custody: [{ id: "c-1", teamMemberId: "tm-actual-holder" }],
        }),
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
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "asset-1", title: "Laptop", custody: [] }),
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

describe("applyHandoverEffect", () => {
  it("puts the asset in custody when a handover completes", async () => {
    const update = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      asset: { update },
      custody: { deleteMany },
      teamMember: { findUnique: vi.fn().mockResolvedValue({ id: "tm-1" }) },
    };

    await applyHandoverEffect(
      {
        id: "ho-1",
        kind: CustodyHandoverKind.HANDOVER,
        assetId: "asset-1",
        organizationId: "org-1",
        counterpartyTeamMemberId: "tm-1",
        operatorUserId: "user-1",
      },
      // @ts-expect-error -- partial transaction client, see runTransactionWith
      tx,
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AssetStatus.IN_CUSTODY }),
      }),
    );
  });

  it("frees the asset when a return completes", async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      asset: { update },
      custody: { deleteMany: vi.fn() },
      teamMember: { findUnique: vi.fn().mockResolvedValue({ id: "tm-1" }) },
    };

    await applyHandoverEffect(
      {
        id: "ho-1",
        kind: CustodyHandoverKind.RETURN,
        assetId: "asset-1",
        organizationId: "org-1",
        counterpartyTeamMemberId: "tm-1",
        operatorUserId: "user-1",
      },
      // @ts-expect-error -- partial transaction client, see runTransactionWith
      tx,
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AssetStatus.AVAILABLE,
          custody: { deleteMany: {} },
        }),
      }),
    );
  });
});
