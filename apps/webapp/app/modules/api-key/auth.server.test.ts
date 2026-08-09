/**
 * Tests for API-key authentication.
 *
 * This is the only gate in front of `/api/v1`, so the suite is written around
 * what an attacker holding a token can and cannot do: a revoked or expired key
 * must not work, a key must not reach beyond its scopes, and — the one that
 * would be catastrophic and silent — the organization must come from the key
 * rather than from anything the caller sends.
 *
 * The database is mocked. The hashing is real, so the digest lookup is
 * exercised rather than stubbed past.
 *
 * @see {@link file://./auth.server.ts}
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// why: the lookup is a single indexed query; mocking it keeps these tests about
// the decision logic rather than about Prisma.
vi.mock("~/database/db.server", () => ({
  db: {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from "~/database/db.server";
import { hashApiToken } from "~/utils/crypto.server";
import { requireApiKey } from "./auth.server";

const findUnique = vi.mocked(db.apiKey.findUnique);
const update = vi.mocked(db.apiKey.update);

const TOKEN = "epda_test-token-value";

/** A live key row with the given overrides. */
function keyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "key-1",
    organizationId: "org-1",
    createdById: "admin-1",
    scopes: ["assets:read"],
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    ...overrides,
  };
}

/** A request carrying the token in the given header. */
function request(headers: Record<string, string>) {
  return new Request("https://epda.local/api/v1/assets", { headers });
}

describe("requireApiKey", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_SECRETS_KEY = "d".repeat(64);
    update.mockResolvedValue({} as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("credential presence", () => {
    it("accepts an Authorization: Bearer token", async () => {
      findUnique.mockResolvedValue(keyRow() as never);

      const context = await requireApiKey(
        request({ Authorization: `Bearer ${TOKEN}` }),
        "assets:read",
      );

      expect(context.organizationId).toBe("org-1");
    });

    it("accepts an x-api-key header", async () => {
      findUnique.mockResolvedValue(keyRow() as never);

      const context = await requireApiKey(
        request({ "x-api-key": TOKEN }),
        "assets:read",
      );

      expect(context.organizationId).toBe("org-1");
    });

    it("rejects a request with no credential", async () => {
      await expect(requireApiKey(request({}), "assets:read")).rejects.toThrow(
        /Invalid or missing API key/,
      );

      expect(findUnique).not.toHaveBeenCalled();
    });

    it("rejects a token supplied in the query string", async () => {
      // Query strings land in access logs, proxy logs and browser history, so
      // the token is deliberately not read from there.
      const withQuery = new Request(
        `https://epda.local/api/v1/assets?token=${TOKEN}`,
      );

      await expect(requireApiKey(withQuery, "assets:read")).rejects.toThrow(
        /Invalid or missing API key/,
      );
    });

    it("looks the key up by digest, never by the token itself", async () => {
      findUnique.mockResolvedValue(keyRow() as never);

      await requireApiKey(
        request({ Authorization: `Bearer ${TOKEN}` }),
        "assets:read",
      );

      expect(findUnique.mock.calls[0][0].where).toEqual({
        hashedKey: hashApiToken(TOKEN),
      });
    });
  });

  describe("credential validity", () => {
    it("rejects an unknown token", async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "assets:read"),
      ).rejects.toThrow(/Invalid or missing API key/);
    });

    it("rejects a revoked key", async () => {
      findUnique.mockResolvedValue(
        keyRow({ revokedAt: new Date("2026-01-01") }) as never,
      );

      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "assets:read"),
      ).rejects.toThrow(/Invalid or missing API key/);
    });

    it("rejects an expired key", async () => {
      findUnique.mockResolvedValue(
        keyRow({ expiresAt: new Date(Date.now() - 1000) }) as never,
      );

      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "assets:read"),
      ).rejects.toThrow(/Invalid or missing API key/);
    });

    it("accepts a key whose expiry is still in the future", async () => {
      findUnique.mockResolvedValue(
        keyRow({ expiresAt: new Date(Date.now() + 60_000) }) as never,
      );

      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "assets:read"),
      ).resolves.toMatchObject({ organizationId: "org-1" });
    });

    it("gives the same message for unknown, revoked and expired keys", async () => {
      // Distinguishing them would let a caller probe which tokens exist.
      const messages: string[] = [];

      for (const row of [
        null,
        keyRow({ revokedAt: new Date() }),
        keyRow({ expiresAt: new Date(Date.now() - 1) }),
      ]) {
        findUnique.mockResolvedValue(row as never);
        await requireApiKey(
          request({ "x-api-key": TOKEN }),
          "assets:read",
        ).catch((error: Error) => messages.push(error.message));
      }

      expect(new Set(messages).size).toBe(1);
    });
  });

  describe("scope enforcement", () => {
    it("rejects a key that lacks the required scope", async () => {
      findUnique.mockResolvedValue(
        keyRow({ scopes: ["assets:read"] }) as never,
      );

      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "assets:write"),
      ).rejects.toThrow(/does not have the required scope/);
    });

    it("does not treat a write scope as implying read, or the reverse", async () => {
      findUnique.mockResolvedValue(
        keyRow({ scopes: ["assets:write"] }) as never,
      );

      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "assets:read"),
      ).rejects.toThrow(/does not have the required scope/);
    });

    it("does not let one resource's scope satisfy another's", async () => {
      findUnique.mockResolvedValue(
        keyRow({ scopes: ["assets:read"] }) as never,
      );

      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "bookings:read"),
      ).rejects.toThrow(/does not have the required scope/);
    });

    it("accepts a key holding several scopes for any one of them", async () => {
      findUnique.mockResolvedValue(
        keyRow({ scopes: ["assets:read", "bookings:read"] }) as never,
      );

      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "bookings:read"),
      ).resolves.toMatchObject({ organizationId: "org-1" });
    });
  });

  describe("organization binding", () => {
    it("takes the organization from the key, ignoring the request", async () => {
      findUnique.mockResolvedValue(
        keyRow({ organizationId: "org-owned" }) as never,
      );

      // Every shape a caller might try to smuggle a different workspace in.
      const spoofed = new Request(
        "https://epda.local/api/v1/assets?orgId=org-other&organizationId=org-other",
        {
          headers: {
            "x-api-key": TOKEN,
            "x-shelf-organization": "org-other",
          },
        },
      );

      const context = await requireApiKey(spoofed, "assets:read");

      expect(context.organizationId).toBe("org-owned");
    });

    it("reports the issuing admin as the acting user for writes", async () => {
      findUnique.mockResolvedValue(
        keyRow({ createdById: "admin-7", scopes: ["assets:write"] }) as never,
      );

      const context = await requireApiKey(
        request({ "x-api-key": TOKEN }),
        "assets:write",
      );

      expect(context.actingUserId).toBe("admin-7");
    });
  });

  describe("usage tracking", () => {
    it("records first use", async () => {
      findUnique.mockResolvedValue(keyRow({ lastUsedAt: null }) as never);

      await requireApiKey(request({ "x-api-key": TOKEN }), "assets:read");

      expect(update).toHaveBeenCalledTimes(1);
    });

    it("does not write again within the debounce window", async () => {
      findUnique.mockResolvedValue(
        keyRow({ lastUsedAt: new Date(Date.now() - 1000) }) as never,
      );

      await requireApiKey(request({ "x-api-key": TOKEN }), "assets:read");

      expect(update).not.toHaveBeenCalled();
    });

    it("authenticates successfully even when the usage write fails", async () => {
      findUnique.mockResolvedValue(keyRow() as never);
      update.mockRejectedValue(new Error("db down"));

      // Telemetry must never fail an otherwise valid request.
      await expect(
        requireApiKey(request({ "x-api-key": TOKEN }), "assets:read"),
      ).resolves.toMatchObject({ organizationId: "org-1" });
    });
  });
});
