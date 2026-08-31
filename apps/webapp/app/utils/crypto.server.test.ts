/**
 * Tests for the settings secret-at-rest encryption.
 *
 * The behaviour that matters is what an operator or an attacker can observe:
 * a stored secret is unreadable without the key, tampering is detected rather
 * than silently accepted, and a lost key degrades to "re-enter the value"
 * instead of a crash. Nothing here asserts on the envelope's internals beyond
 * the version marker, so the format can change without rewriting the suite.
 *
 * No mocks: the module is pure Node crypto over an env var.
 *
 * @see {@link file://./crypto.server.ts}
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A fixed 64-hex key, used verbatim by the module. */
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

/**
 * `process.env` widened so a variable can be removed.
 *
 * The app augments `ProcessEnv` with required string keys, which makes `delete`
 * a type error. These tests genuinely need the "not configured at all" case.
 */
const env = process.env as Record<string, string | undefined>;

/**
 * Loads a fresh copy of the module.
 *
 * The derived key is memoized per process, so every test that changes the key
 * material must re-import rather than reuse the cached module.
 */
async function loadCrypto() {
  vi.resetModules();
  return import("./crypto.server");
}

describe("settings secret encryption", () => {
  const originalKey = process.env.APP_SECRETS_KEY;
  const originalSession = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.APP_SECRETS_KEY = KEY_A;
  });

  afterEach(() => {
    process.env.APP_SECRETS_KEY = originalKey;
    process.env.SESSION_SECRET = originalSession;
  });

  it("returns the original value after a round trip", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto();

    const secret = "s3cr3t-ldap-bind-password";

    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("round-trips values that are not plain ASCII", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto();

    // Certificates carry newlines; Arabic labels may reach these fields too.
    const secret = "-----BEGIN CERT-----\nسر\n-----END CERT-----";

    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("does not leak the plaintext into the stored envelope", async () => {
    const { encryptSecret } = await loadCrypto();

    const envelope = encryptSecret("hunter2");

    expect(envelope).not.toContain("hunter2");
    expect(envelope.startsWith("v1.")).toBe(true);
  });

  it("produces a different envelope each time, so equal secrets are not linkable", async () => {
    const { encryptSecret } = await loadCrypto();

    // A fresh IV per call means two settings holding the same value do not
    // reveal that fact to anyone reading the table.
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses to decrypt a tampered envelope", async () => {
    const { encryptSecret, decryptSecret } = await loadCrypto();

    const envelope = encryptSecret("original");
    const [version, iv, tag, ciphertext] = envelope.split(".");

    // Flip a character of the ciphertext. GCM authenticates, so this must fail
    // rather than return a corrupted string.
    const flipped = ciphertext.startsWith("A")
      ? `B${ciphertext.slice(1)}`
      : `A${ciphertext.slice(1)}`;

    expect(decryptSecret([version, iv, tag, flipped].join("."))).toBeNull();
  });

  it("returns null for a value encrypted under a different key", async () => {
    const first = await loadCrypto();
    const envelope = first.encryptSecret("cross-key");

    process.env.APP_SECRETS_KEY = KEY_B;
    const second = await loadCrypto();

    // This is the rotated-key case: unreadable, but not fatal — the settings
    // screen shows the field empty so an admin can re-enter it.
    expect(second.decryptSecret(envelope)).toBeNull();
  });

  it("returns null for an unrecognised envelope format", async () => {
    const { decryptSecret } = await loadCrypto();

    expect(decryptSecret("not-an-envelope")).toBeNull();
    expect(decryptSecret("v2.a.b.c")).toBeNull();
    expect(decryptSecret("")).toBeNull();
  });

  it("falls back to SESSION_SECRET when no dedicated key is configured", async () => {
    delete env.APP_SECRETS_KEY;
    process.env.SESSION_SECRET = "session-secret-for-derivation";

    const { encryptSecret, decryptSecret } = await loadCrypto();

    expect(decryptSecret(encryptSecret("derived"))).toBe("derived");
  });

  it("accepts a non-hex key by hashing it to the right length", async () => {
    process.env.APP_SECRETS_KEY = "a short human-chosen passphrase";

    const { encryptSecret, decryptSecret } = await loadCrypto();

    expect(decryptSecret(encryptSecret("value"))).toBe("value");
  });

  it("throws when no key material exists at all", async () => {
    delete env.APP_SECRETS_KEY;
    delete env.SESSION_SECRET;

    const { encryptSecret } = await loadCrypto();

    expect(() => encryptSecret("value")).toThrow(/APP_SECRETS_KEY/);
  });
});

describe("API token hashing", () => {
  beforeEach(() => {
    process.env.APP_SECRETS_KEY = KEY_A;
  });

  it("is deterministic, so a token can be looked up by its digest", async () => {
    const { hashApiToken } = await loadCrypto();

    expect(hashApiToken("org_abc")).toBe(hashApiToken("org_abc"));
  });

  it("produces different digests for different tokens", async () => {
    const { hashApiToken } = await loadCrypto();

    expect(hashApiToken("org_abc")).not.toBe(hashApiToken("org_abd"));
  });

  it("never returns the token itself", async () => {
    const { hashApiToken } = await loadCrypto();

    const digest = hashApiToken("org_supersecret");

    expect(digest).not.toContain("supersecret");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("safeCompare", () => {
  beforeEach(() => {
    process.env.APP_SECRETS_KEY = KEY_A;
  });

  it("matches equal strings and rejects unequal ones", async () => {
    const { safeCompare } = await loadCrypto();

    expect(safeCompare("abc", "abc")).toBe(true);
    expect(safeCompare("abc", "abd")).toBe(false);
  });

  it("rejects strings of different lengths without throwing", async () => {
    const { safeCompare } = await loadCrypto();

    // timingSafeEqual throws on length mismatch; the wrapper must not.
    expect(safeCompare("short", "much longer value")).toBe(false);
  });
});
