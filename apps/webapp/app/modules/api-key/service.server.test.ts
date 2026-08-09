/**
 * Tests for API-key issuance and revocation.
 *
 * The property that everything else rests on: the plaintext token is returned
 * to the caller once and never stored. If that regresses, a database dump
 * becomes a set of working credentials — and no other check in the system would
 * notice.
 *
 * @see {@link file://./service.server.ts}
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// why: these tests are about validation and the hashing contract, not Prisma.
vi.mock("~/database/db.server", () => ({
  db: {
    apiKey: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    organization: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

import { db } from "~/database/db.server";
import { hashApiToken } from "~/utils/crypto.server";
import { createApiKey, listApiKeys, revokeApiKey } from "./service.server";

const create = vi.mocked(db.apiKey.create);
const findUnique = vi.mocked(db.apiKey.findUnique);
const findMany = vi.mocked(db.apiKey.findMany);
const update = vi.mocked(db.apiKey.update);
const orgFindUnique = vi.mocked(db.organization.findUnique);

/** A row shaped like what Prisma returns from `create` / `update`. */
function createdRow(data: Record<string, unknown> = {}) {
  return {
    id: "key-1",
    name: "ERP sync",
    prefix: "epda_stored",
    hashedKey: "stored-digest",
    scopes: ["assets:read"],
    organizationId: "org-1",
    createdById: "admin-1",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-08-04"),
    updatedAt: new Date("2026-08-04"),
    expiresAt: null,
    ...data,
    organization: { name: "EPDA" },
    createdBy: { email: "admin@epda.local" },
  };
}

/**
 * What was handed to `db.apiKey.create`.
 *
 * Assertions read this rather than the mock's return value: the token is
 * generated inside the service, so what it *wrote* is the honest evidence of
 * what would land in the database.
 */
function writtenData() {
  return create.mock.calls[0][0].data as Record<string, unknown>;
}

describe("createApiKey", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_SECRETS_KEY = "e".repeat(64);
    orgFindUnique.mockResolvedValue({ id: "org-1" } as never);
    create.mockResolvedValue(createdRow() as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns a token and stores only its digest", async () => {
    const result = await createApiKey({
      name: "ERP sync",
      organizationId: "org-1",
      scopes: ["assets:read"],
      userId: "admin-1",
    });

    const stored = writtenData();

    expect(result.token).toBeTruthy();
    // The whole point: the plaintext is nowhere in what was written.
    expect(JSON.stringify(stored)).not.toContain(result.token);
    expect(stored.hashedKey).toBe(hashApiToken(result.token));
  });

  it("issues a distinct token each time", async () => {
    const first = await createApiKey({
      name: "a",
      organizationId: "org-1",
      scopes: ["assets:read"],
      userId: "admin-1",
    });
    const second = await createApiKey({
      name: "b",
      organizationId: "org-1",
      scopes: ["assets:read"],
      userId: "admin-1",
    });

    expect(first.token).not.toBe(second.token);
  });

  it("gives the token an identifiable prefix", async () => {
    // Makes a leaked credential recognisable in logs and greppable by scanners.
    const result = await createApiKey({
      name: "ERP sync",
      organizationId: "org-1",
      scopes: ["assets:read"],
      userId: "admin-1",
    });

    expect(result.token.startsWith("epda_")).toBe(true);
    // The stored prefix is a leading slice of the issued token, so an admin can
    // match a key in the list to the credential an integration is using.
    expect(result.token.startsWith(writtenData().prefix as string)).toBe(true);
  });

  it("binds the key to the requested workspace", async () => {
    await createApiKey({
      name: "ERP sync",
      organizationId: "org-1",
      scopes: ["assets:read"],
      userId: "admin-1",
    });

    expect(create.mock.calls[0][0].data).toMatchObject({
      organizationId: "org-1",
      createdById: "admin-1",
    });
  });

  it("rejects an unknown scope rather than issuing a key with it", async () => {
    await expect(
      createApiKey({
        name: "ERP sync",
        organizationId: "org-1",
        scopes: ["assets:read", "everything:*"],
        userId: "admin-1",
      }),
    ).rejects.toThrow(/Unknown scope/);

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an empty scope list", async () => {
    // Such a key would authenticate but authorize nothing — a confusing failure
    // at every endpoint rather than a clear one here.
    await expect(
      createApiKey({
        name: "ERP sync",
        organizationId: "org-1",
        scopes: [],
        userId: "admin-1",
      }),
    ).rejects.toThrow(/at least one scope/);

    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a workspace that does not exist", async () => {
    orgFindUnique.mockResolvedValue(null);

    await expect(
      createApiKey({
        name: "ERP sync",
        organizationId: "org-missing",
        scopes: ["assets:read"],
        userId: "admin-1",
      }),
    ).rejects.toThrow(/Workspace not found/);
  });
});

describe("revokeApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft-deletes so the audit trail survives", async () => {
    findUnique.mockResolvedValue({ id: "key-1", revokedAt: null } as never);
    update.mockResolvedValue(
      createdRow({
        name: "ERP sync",
        prefix: "epda_ab",
        scopes: [],
        revokedAt: new Date(),
      }) as never,
    );

    await revokeApiKey({ id: "key-1" });

    expect(update.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date);
  });

  it("keeps the original timestamp when revoking twice", async () => {
    const firstRevocation = new Date("2026-01-01");
    findUnique.mockResolvedValue({
      id: "key-1",
      revokedAt: firstRevocation,
    } as never);
    update.mockResolvedValue(
      createdRow({
        name: "ERP sync",
        prefix: "epda_ab",
        scopes: [],
        revokedAt: firstRevocation,
      }) as never,
    );

    // A double-click must not rewrite when the key was actually revoked.
    await revokeApiKey({ id: "key-1" });

    expect(update.mock.calls[0][0].data.revokedAt).toBe(firstRevocation);
  });

  it("reports a missing key rather than silently succeeding", async () => {
    findUnique.mockResolvedValue(null);

    await expect(revokeApiKey({ id: "nope" })).rejects.toThrow(
      /API key not found/,
    );

    expect(update).not.toHaveBeenCalled();
  });
});

describe("listApiKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never includes a token or its digest in the listing", async () => {
    findMany.mockResolvedValue([
      createdRow({
        name: "ERP sync",
        prefix: "epda_abcd1234",
        hashedKey: "deadbeef".repeat(8),
        scopes: ["assets:read"],
        organizationId: "org-1",
      }),
    ] as never);

    const keys = await listApiKeys();

    expect(JSON.stringify(keys)).not.toContain("deadbeef");
    expect(keys[0].prefix).toBe("epda_abcd1234");
  });

  it("derives status from revocation and expiry", async () => {
    findMany.mockResolvedValue([
      createdRow({
        name: "live",
        prefix: "a",
        scopes: [],
        organizationId: "org-1",
      }),
      createdRow({
        name: "revoked",
        prefix: "b",
        scopes: [],
        organizationId: "org-1",
        revokedAt: new Date("2026-01-01"),
      }),
      createdRow({
        name: "expired",
        prefix: "c",
        scopes: [],
        organizationId: "org-1",
        expiresAt: new Date("2020-01-01"),
      }),
    ] as never);

    const keys = await listApiKeys();

    expect(keys.map((key) => key.status)).toEqual([
      "active",
      "revoked",
      "expired",
    ]);
  });

  it("reports a key that was revoked and has since expired as revoked", async () => {
    // Revocation is an act someone took; expiry is just time passing.
    findMany.mockResolvedValue([
      createdRow({
        name: "both",
        prefix: "d",
        scopes: [],
        organizationId: "org-1",
        revokedAt: new Date("2026-01-01"),
        expiresAt: new Date("2020-01-01"),
      }),
    ] as never);

    const keys = await listApiKeys();

    expect(keys[0].status).toBe("revoked");
  });
});
