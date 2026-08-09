/**
 * Tests for instance-settings reads and writes.
 *
 * Three properties carry the security of this module and each has a test that
 * fails loudly if it regresses:
 *
 * 1. A secret's plaintext never appears in the admin view.
 * 2. Submitting the redaction placeholder does not overwrite the real secret —
 *    the failure mode that would silently destroy every credential the first
 *    time an admin saved the form.
 * 3. An unrecognised key is rejected rather than stored.
 *
 * The database is mocked; the encryption is real, so the round trip through
 * `encryptSecret`/`decryptSecret` is exercised rather than assumed.
 *
 * @see {@link file://./service.server.ts}
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// why: these tests are about resolution and redaction rules, not about Prisma.
// The mock is declared before the import so the module under test picks it up.
vi.mock("~/database/db.server", () => ({
  db: {
    appSetting: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { db } from "~/database/db.server";
import { encryptSecret } from "~/utils/crypto.server";
import { REDACTED } from "./registry";
import {
  getResolvedSettings,
  getSettingsForAdmin,
  updateSettings,
} from "./service.server";

const findMany = vi.mocked(db.appSetting.findMany);
const upsert = vi.mocked(db.appSetting.upsert);
const transaction = vi.mocked(db.$transaction);

/** Builds an `AppSetting` row with sensible defaults. */
function row(overrides: {
  key: string;
  value: string | null;
  isSecret?: boolean;
  category?: string;
}) {
  return {
    key: overrides.key,
    value: overrides.value,
    isSecret: overrides.isSecret ?? false,
    category: overrides.category ?? "auth",
    updatedById: "admin-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("app settings", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_SECRETS_KEY = "c".repeat(64);
    findMany.mockResolvedValue([]);
    // The real implementation runs the upsert array; returning it is enough for
    // these tests, which assert on what was handed to `upsert`.
    transaction.mockImplementation((operations: unknown) =>
      Promise.resolve(operations),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("resolution order", () => {
    it("prefers a stored row over the registry default", async () => {
      findMany.mockResolvedValue([row({ key: "auth.method", value: "oidc" })]);

      const settings = await getResolvedSettings();

      expect(settings.get("auth.method")).toBe("oidc");
    });

    it("falls back to the environment when no row exists", async () => {
      process.env.DISABLE_SIGNUP = "false";

      const settings = await getResolvedSettings();

      expect(settings.get("auth.disableSignup")).toBe("false");
    });

    it("falls back to the registry default when neither exists", async () => {
      // `ProcessEnv` is augmented with required string keys, so removing one
      // needs the widened view.
      delete (process.env as Record<string, string | undefined>)
        .MAINTENANCE_MODE;

      const settings = await getResolvedSettings();

      expect(settings.get("general.maintenanceMode")).toBe("false");
    });

    it("treats a cleared row as unset, restoring the fallback", async () => {
      // Clearing a field in the UI should restore configured behaviour rather
      // than pin the setting to an empty string.
      process.env.DISABLE_SIGNUP = "true";
      findMany.mockResolvedValue([
        row({ key: "auth.disableSignup", value: null }),
      ]);

      const settings = await getResolvedSettings();

      expect(settings.get("auth.disableSignup")).toBe("true");
    });

    it("ignores rows whose key is not in the registry", async () => {
      findMany.mockResolvedValue([
        row({ key: "auth.method", value: "oidc" }),
        row({ key: "attacker.injected", value: "whatever" }),
      ]);

      const settings = await getResolvedSettings();

      expect(settings.has("attacker.injected")).toBe(false);
    });

    it("decrypts stored secrets for server-side consumers", async () => {
      findMany.mockResolvedValue([
        row({
          key: "ldap.bindPassword",
          value: encryptSecret("real-password"),
          isSecret: true,
          category: "ldap",
        }),
      ]);

      const settings = await getResolvedSettings();

      expect(settings.get("ldap.bindPassword")).toBe("real-password");
    });

    it("degrades an unreadable secret to empty rather than throwing", async () => {
      findMany.mockResolvedValue([
        row({
          key: "ldap.bindPassword",
          value: "v1.garbage.garbage.garbage",
          isSecret: true,
          category: "ldap",
        }),
      ]);

      const settings = await getResolvedSettings();

      expect(settings.get("ldap.bindPassword")).toBe("");
    });
  });

  describe("admin view", () => {
    it("redacts a secret that has a value", async () => {
      findMany.mockResolvedValue([
        row({
          key: "ldap.bindPassword",
          value: encryptSecret("real-password"),
          isSecret: true,
          category: "ldap",
        }),
      ]);

      const view = await getSettingsForAdmin();
      const field = view.find((s) => s.key === "ldap.bindPassword");

      expect(field?.value).toBe(REDACTED);
      expect(field?.hasValue).toBe(true);
    });

    it("never exposes a secret's plaintext anywhere in the payload", async () => {
      findMany.mockResolvedValue([
        row({
          key: "oidc.clientSecret",
          value: encryptSecret("super-secret-value"),
          isSecret: true,
          category: "oidc",
        }),
      ]);

      const view = await getSettingsForAdmin();

      expect(JSON.stringify(view)).not.toContain("super-secret-value");
    });

    it("reports an unset secret as empty rather than redacted", async () => {
      const view = await getSettingsForAdmin();
      const field = view.find((s) => s.key === "oidc.clientSecret");

      // An empty box invites the admin to fill it; a placeholder would imply a
      // value is already stored.
      expect(field?.value).toBe("");
      expect(field?.hasValue).toBe(false);
    });

    it("returns non-secret values in the clear", async () => {
      findMany.mockResolvedValue([
        row({ key: "saml.entryPoint", value: "https://idp.example/sso" }),
      ]);

      const view = await getSettingsForAdmin();

      expect(view.find((s) => s.key === "saml.entryPoint")?.value).toBe(
        "https://idp.example/sso",
      );
    });
  });

  describe("writes", () => {
    it("stores a plain value as given", async () => {
      await updateSettings({
        updates: [{ key: "saml.issuer", value: "epda-sp" }],
        userId: "admin-1",
      });

      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert.mock.calls[0][0].create).toMatchObject({
        key: "saml.issuer",
        value: "epda-sp",
        isSecret: false,
        updatedById: "admin-1",
      });
    });

    it("encrypts a secret before storing it", async () => {
      await updateSettings({
        updates: [{ key: "ldap.bindPassword", value: "plaintext-password" }],
        userId: "admin-1",
      });

      const stored = upsert.mock.calls[0][0].create.value as string;

      expect(stored).not.toBe("plaintext-password");
      expect(stored.startsWith("v1.")).toBe(true);
    });

    it("skips a secret submitted as the redaction placeholder", async () => {
      // The form round-trips `••••••••` for untouched secret fields. Writing it
      // would replace every credential with the placeholder text.
      const written = await updateSettings({
        updates: [{ key: "ldap.bindPassword", value: REDACTED }],
        userId: "admin-1",
      });

      expect(written).toBe(0);
      expect(upsert).not.toHaveBeenCalled();
    });

    it("still writes the other keys in a batch containing an untouched secret", async () => {
      await updateSettings({
        updates: [
          { key: "ldap.bindPassword", value: REDACTED },
          { key: "ldap.url", value: "ldaps://dc.epda.local:636" },
        ],
        userId: "admin-1",
      });

      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert.mock.calls[0][0].create.key).toBe("ldap.url");
    });

    it("stores an empty value as null so the fallback applies again", async () => {
      await updateSettings({
        updates: [{ key: "saml.issuer", value: "" }],
        userId: "admin-1",
      });

      expect(upsert.mock.calls[0][0].create.value).toBeNull();
    });

    it("rejects an unknown key and writes nothing", async () => {
      await expect(
        updateSettings({
          updates: [
            { key: "saml.issuer", value: "epda-sp" },
            { key: "attacker.injected", value: "payload" },
          ],
          userId: "admin-1",
        }),
      ).rejects.toThrow(/Unknown setting/);

      // The whole batch fails — applying the recognised half would leave the
      // configuration in a state the admin never asked for.
      expect(upsert).not.toHaveBeenCalled();
    });

    it("rejects a non-boolean value for a boolean setting", async () => {
      await expect(
        updateSettings({
          updates: [{ key: "saml.enabled", value: "maybe" }],
          userId: "admin-1",
        }),
      ).rejects.toThrow(/must be "true" or "false"/);
    });

    it("rejects a value outside an enum's options", async () => {
      await expect(
        updateSettings({
          updates: [{ key: "auth.method", value: "kerberos" }],
          userId: "admin-1",
        }),
      ).rejects.toThrow(/must be one of/);
    });

    it("accepts every declared option for an enum setting", async () => {
      for (const method of ["password", "saml", "oidc", "ldap"]) {
        await expect(
          updateSettings({
            updates: [{ key: "auth.method", value: method }],
            userId: "admin-1",
          }),
        ).resolves.toBe(1);
      }
    });
  });
});
