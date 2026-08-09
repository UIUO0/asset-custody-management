/**
 * Tests for the effective authentication configuration.
 *
 * The two behaviours worth guarding:
 *
 * 1. **The lockout guard.** Turning off password login must never apply to
 *    app-wide admins. If it did, saving a directory integration with a wrong
 *    certificate would lock out the only account able to correct it — an
 *    unrecoverable state reachable from a single form submission.
 * 2. **Enabled is not the same as configured.** A directory that is switched on
 *    but missing credentials must not be offered on the login screen, or users
 *    are sent to a redirect that cannot complete.
 *
 * @see {@link file://./auth-config.server.ts}
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/database/db.server";
import {
  assertPasswordLoginAllowed,
  getAuthConfig,
} from "./auth-config.server";
import { getResolvedSettings } from "../app-settings/service.server";
import type * as AppSettingsService from "../app-settings/service.server";

// why: this module's job is deriving a config from settings; the settings
// source and the admin lookup are both stubbed so each derivation rule can be
// exercised on its own. `asBoolean` stays real — it is part of the derivation
// under test, not a dependency to be faked.
vi.mock("../app-settings/service.server", async () => {
  const actual = await vi.importActual<typeof AppSettingsService>(
    "../app-settings/service.server",
  );

  return { ...actual, getResolvedSettings: vi.fn() };
});

vi.mock("~/database/db.server", () => ({
  db: { user: { findFirst: vi.fn() } },
}));

const resolvedSettings = vi.mocked(getResolvedSettings);
const findFirst = vi.mocked(db.user.findFirst);

/** Builds a settings map from the defaults plus the given overrides. */
function settings(overrides: Record<string, string> = {}) {
  return new Map(
    Object.entries({
      "auth.method": "password",
      "auth.allowPasswordLogin": "true",
      "auth.disableSignup": "true",
      "saml.enabled": "false",
      "saml.entryPoint": "",
      "saml.certificate": "",
      "oidc.enabled": "false",
      "oidc.issuerUrl": "",
      "oidc.clientId": "",
      "oidc.clientSecret": "",
      "ldap.enabled": "false",
      "ldap.url": "",
      "ldap.searchBase": "",
      ...overrides,
    }),
  );
}

describe("getAuthConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to password authentication", async () => {
    resolvedSettings.mockResolvedValue(settings());

    const config = await getAuthConfig();

    expect(config.method).toBe("password");
    expect(config.showSsoEntryPoint).toBe(false);
  });

  it("falls back to password for an unrecognised stored method", async () => {
    // A value left behind by an older version must not disable login entirely.
    resolvedSettings.mockResolvedValue(settings({ "auth.method": "kerberos" }));

    const config = await getAuthConfig();

    expect(config.method).toBe("password");
  });

  it("offers SSO when the selected directory is enabled and complete", async () => {
    resolvedSettings.mockResolvedValue(
      settings({
        "auth.method": "saml",
        "saml.enabled": "true",
        "saml.entryPoint": "https://idp.example/sso",
        "saml.certificate": "-----BEGIN CERT-----",
      }),
    );

    const config = await getAuthConfig();

    expect(config.saml).toEqual({ enabled: true, configured: true });
    expect(config.showSsoEntryPoint).toBe(true);
  });

  it("withholds SSO when the selected directory is enabled but incomplete", async () => {
    resolvedSettings.mockResolvedValue(
      settings({
        "auth.method": "saml",
        "saml.enabled": "true",
        "saml.entryPoint": "https://idp.example/sso",
        // Certificate missing — the redirect could not be verified.
        "saml.certificate": "",
      }),
    );

    const config = await getAuthConfig();

    expect(config.saml.configured).toBe(false);
    expect(config.showSsoEntryPoint).toBe(false);
  });

  it("withholds SSO when a fully configured directory is not the selected method", async () => {
    resolvedSettings.mockResolvedValue(
      settings({
        "auth.method": "password",
        "oidc.enabled": "true",
        "oidc.issuerUrl": "https://login.example/v2.0",
        "oidc.clientId": "client",
        "oidc.clientSecret": "secret",
      }),
    );

    const config = await getAuthConfig();

    expect(config.oidc.configured).toBe(true);
    expect(config.showSsoEntryPoint).toBe(false);
  });

  it("treats a directory as unconfigured when its credentials are missing", async () => {
    resolvedSettings.mockResolvedValue(
      settings({
        "auth.method": "oidc",
        "oidc.enabled": "true",
        "oidc.issuerUrl": "https://login.example/v2.0",
        "oidc.clientId": "client",
        "oidc.clientSecret": "",
      }),
    );

    const config = await getAuthConfig();

    expect(config.showSsoEntryPoint).toBe(false);
  });

  it("recognises a complete LDAP configuration", async () => {
    resolvedSettings.mockResolvedValue(
      settings({
        "auth.method": "ldap",
        "ldap.enabled": "true",
        "ldap.url": "ldaps://dc.epda.local:636",
        "ldap.searchBase": "ou=users,dc=epda,dc=local",
      }),
    );

    const config = await getAuthConfig();

    expect(config.showSsoEntryPoint).toBe(true);
  });

  it("carries no secret values in its result", async () => {
    resolvedSettings.mockResolvedValue(
      settings({
        "auth.method": "oidc",
        "oidc.enabled": "true",
        "oidc.issuerUrl": "https://login.example/v2.0",
        "oidc.clientId": "client",
        "oidc.clientSecret": "top-secret-client-secret",
      }),
    );

    // The result is serialized into the login page's loader payload, so it must
    // not carry credentials.
    const config = await getAuthConfig();

    expect(JSON.stringify(config)).not.toContain("top-secret-client-secret");
  });
});

describe("assertPasswordLoginAllowed", () => {
  const authConfigWith = (allowPasswordLogin: boolean) =>
    ({
      method: "saml",
      allowPasswordLogin,
      disableSignup: true,
      saml: { enabled: true, configured: true },
      oidc: { enabled: false, configured: false },
      ldap: { enabled: false, configured: false },
      showSsoEntryPoint: true,
    }) as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows anyone through when password login is enabled", async () => {
    await expect(
      assertPasswordLoginAllowed({
        userId: "user-1",
        authConfig: authConfigWith(true),
      }),
    ).resolves.toBeUndefined();

    // No need to ask the database who is an admin when nobody is being refused.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refuses an ordinary user when password login is disabled", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      assertPasswordLoginAllowed({
        userId: "user-1",
        authConfig: authConfigWith(false),
      }),
    ).rejects.toThrow(/Password sign-in is disabled/);
  });

  it("still admits an app-wide admin when password login is disabled", async () => {
    findFirst.mockResolvedValue({ id: "admin-1" } as never);

    // The lockout guard: a misconfigured directory must not shut out the
    // account needed to fix it.
    await expect(
      assertPasswordLoginAllowed({
        userId: "admin-1",
        authConfig: authConfigWith(false),
      }),
    ).resolves.toBeUndefined();
  });

  it("checks admin status against the database, not the submitted identity", async () => {
    findFirst.mockResolvedValue(null);

    await assertPasswordLoginAllowed({
      userId: "user-1",
      authConfig: authConfigWith(false),
    }).catch(() => undefined);

    // `findFirst`'s argument is optional in Prisma's signature, so it is
    // narrowed here rather than asserted on directly.
    expect(findFirst.mock.calls[0][0]?.where).toMatchObject({
      id: "user-1",
      roles: { some: { name: "ADMIN" } },
    });
  });
});
