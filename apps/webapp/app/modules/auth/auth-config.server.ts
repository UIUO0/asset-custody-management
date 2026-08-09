/**
 * Effective authentication configuration.
 *
 * The login screen used to read `config.disableSSO` — a value fixed at boot from
 * `.env`. It now asks this module, which resolves the same questions from
 * `AppSetting` with the environment as fallback. Changing the sign-in method
 * becomes a save in the admin screen rather than a redeploy.
 *
 * ## The lockout guard
 *
 * `allowPasswordLogin` is honoured for ordinary employees but **never** for
 * app-wide admins (`Roles.ADMIN`, تقنية المعلومات). A directory integration that
 * is saved with a wrong certificate or an unreachable host would otherwise lock
 * every account out of the system, including the account needed to correct the
 * setting. {@link assertPasswordLoginAllowed} encodes that: an admin can always
 * sign in with a password.
 *
 * ## What this module does and does not do
 *
 * It resolves and validates *configuration*. It does not implement SAML, OIDC or
 * LDAP transport — SAML runs through Supabase (see `utils/sso.server.ts`), and
 * OIDC/LDAP are configured here ahead of their clients. `getAuthConfig` is the
 * single place those clients will read from when they land, so nothing else has
 * to change when they do.
 *
 * @see {@link file://./../app-settings/registry.ts} the settings themselves
 * @see {@link file://./../../routes/_auth+/login.tsx} the main consumer
 */

import { Roles } from "@prisma/client";
import { db } from "~/database/db.server";
import { ShelfError } from "~/utils/error";
import type { AuthMethod } from "../app-settings/registry";
import { asBoolean, getResolvedSettings } from "../app-settings/service.server";

const label = "Auth" as const;

/** Connection details for one directory integration, plus whether it is live. */
export type DirectoryConfig = {
  enabled: boolean;
  /**
   * Whether every field the integration needs is present. A provider can be
   * enabled but incomplete — half-configured, mid-setup — and the login screen
   * must not offer it in that state.
   */
  configured: boolean;
};

export type AuthConfig = {
  /** The method chosen in settings. Advisory: an unconfigured one is not offered. */
  method: AuthMethod;
  /** Whether ordinary users may sign in with email and password. */
  allowPasswordLogin: boolean;
  /** Whether self-registration is closed. */
  disableSignup: boolean;
  saml: DirectoryConfig;
  oidc: DirectoryConfig;
  ldap: DirectoryConfig;
  /**
   * Whether the login screen should show the SSO entry point. True only when
   * the selected method is a directory one *and* that directory is completely
   * configured — so a partially filled form never strands users on a broken
   * redirect.
   */
  showSsoEntryPoint: boolean;
};

/**
 * Resolves the live authentication configuration.
 *
 * Safe to serialize into a loader payload: it carries no secrets, only booleans
 * and the selected method name.
 *
 * @returns The effective configuration
 */
export async function getAuthConfig(): Promise<AuthConfig> {
  const settings = await getResolvedSettings();
  const get = (key: string) => settings.get(key) ?? "";

  const saml: DirectoryConfig = {
    enabled: asBoolean(get("saml.enabled")),
    // Entry point and certificate are the two fields without which a redirect
    // cannot even be attempted; the rest have workable defaults.
    configured: Boolean(get("saml.entryPoint") && get("saml.certificate")),
  };

  const oidc: DirectoryConfig = {
    enabled: asBoolean(get("oidc.enabled")),
    configured: Boolean(
      get("oidc.issuerUrl") && get("oidc.clientId") && get("oidc.clientSecret"),
    ),
  };

  const ldap: DirectoryConfig = {
    enabled: asBoolean(get("ldap.enabled")),
    configured: Boolean(get("ldap.url") && get("ldap.searchBase")),
  };

  const rawMethod = get("auth.method");
  const method: AuthMethod = isAuthMethod(rawMethod) ? rawMethod : "password";

  const directories: Record<
    Exclude<AuthMethod, "password">,
    DirectoryConfig
  > = {
    saml,
    oidc,
    ldap,
  };

  const selectedDirectory = method === "password" ? null : directories[method];

  return {
    method,
    allowPasswordLogin: asBoolean(get("auth.allowPasswordLogin")),
    disableSignup: asBoolean(get("auth.disableSignup")),
    saml,
    oidc,
    ldap,
    showSsoEntryPoint: Boolean(
      selectedDirectory?.enabled && selectedDirectory.configured,
    ),
  };
}

/**
 * Narrows a stored string to a known method.
 *
 * A value the registry no longer recognises falls back to `password` rather
 * than disabling login entirely.
 *
 * @param value - Raw `auth.method` value
 */
function isAuthMethod(value: string): value is AuthMethod {
  return (
    value === "password" ||
    value === "saml" ||
    value === "oidc" ||
    value === "ldap"
  );
}

/**
 * Refuses a password sign-in when the configuration has turned it off.
 *
 * App-wide admins are exempt, by design — see the lockout guard in this
 * module's header. The exemption is checked against the database rather than
 * the submitted form, so it cannot be claimed by an attacker.
 *
 * Called after credentials are verified, not before: checking earlier would let
 * an unauthenticated caller learn which addresses belong to admins by comparing
 * which ones are refused.
 *
 * @param args.userId - The user who just authenticated
 * @param args.authConfig - Resolved config; passed in to avoid a second read
 * @throws {ShelfError} 403 when password login is disabled for this user
 */
export async function assertPasswordLoginAllowed({
  userId,
  authConfig,
}: {
  userId: string;
  authConfig: AuthConfig;
}): Promise<void> {
  if (authConfig.allowPasswordLogin) return;

  const admin = await db.user.findFirst({
    where: { id: userId, roles: { some: { name: Roles.ADMIN } } },
    select: { id: true },
  });

  if (admin) return;

  throw new ShelfError({
    cause: null,
    message:
      "Password sign-in is disabled for this system. Please use your organization account.",
    additionalData: { userId },
    label,
    status: 403,
    shouldBeCaptured: false,
  });
}
