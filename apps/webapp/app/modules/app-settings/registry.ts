/**
 * The catalogue of instance-wide settings.
 *
 * This module — not the `AppSetting` table — decides which settings exist. A
 * row whose key is absent from the registry is ignored on read and rejected on
 * write, so a stale or hand-inserted row can never influence behaviour. A
 * registry entry with no row falls back to its `defaultValue`.
 *
 * That inversion is what makes the settings safe to expose over an API: the
 * write endpoint validates against a fixed key set rather than accepting
 * whatever keys the caller sends.
 *
 * ## Adding a setting
 *
 * Add an entry here and nothing else. The GET/PUT endpoints, the admin form,
 * redaction of secrets, and type coercion all derive from this list.
 *
 * Deliberately a plain module (no `.server` suffix): it holds no secrets and no
 * Node built-ins, so the admin UI imports it to render the form. Keeping it
 * neutral also avoids the `.client.ts` failure mode documented in CLAUDE.md,
 * where the bundler blanks a module's exports on the other side.
 *
 * @see {@link file://./service.server.ts} reading and writing values
 * @see {@link file://./../auth/auth-config.server.ts} the main consumer
 */

/** Value shapes a setting can hold. Drives coercion and the form control. */
export type SettingType = "string" | "boolean" | "number" | "enum";

/** Grouping used by the settings API response and the admin form sections. */
export type SettingCategory = "general" | "auth" | "saml" | "oidc" | "ldap";

export type SettingDefinition = {
  /** Stable storage key. Never rename one — add a new key and migrate. */
  key: string;
  category: SettingCategory;
  type: SettingType;
  /** English label for the admin form (admin-dashboard is not translated). */
  label: string;
  /** One-line explanation shown under the field. */
  description?: string;
  /**
   * Value used when no row exists. Also what a cleared setting falls back to,
   * which is why "off" defaults are the safe choice for every toggle here.
   */
  defaultValue: string;
  /**
   * Whether the value is encrypted at rest and redacted in API responses.
   * Never returned in plaintext by the settings endpoints — only
   * `getAuthConfig()` and other server-side consumers see the real value.
   */
  isSecret?: boolean;
  /** Allowed values for `type: "enum"`. */
  options?: readonly string[];
  /**
   * Environment variable consulted when no row exists, before `defaultValue`.
   *
   * This is what makes the migration to database-backed settings a no-op: a
   * deployment configured entirely through `.env` keeps behaving identically
   * until an admin saves the form, at which point the stored row takes over.
   */
  envFallback?: string;
};

/** Authentication methods the login flow understands. */
export const AUTH_METHODS = ["password", "saml", "oidc", "ldap"] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

/**
 * Every setting the system knows about.
 *
 * Ordered by category so the admin form renders in a sensible sequence without
 * a separate ordering table.
 */
export const SETTING_DEFINITIONS = [
  // ── General ────────────────────────────────────────────────────────────
  {
    key: "general.appName",
    category: "general",
    type: "string",
    label: "Application name",
    description: "Shown in email subjects and downloaded file names.",
    defaultValue: "SDA Assets",
  },
  {
    key: "general.supportEmail",
    category: "general",
    type: "string",
    label: "Support email",
    description: "Address employees are pointed at when something goes wrong.",
    defaultValue: "",
    envFallback: "SUPPORT_EMAIL",
  },
  {
    key: "general.maintenanceMode",
    category: "general",
    type: "boolean",
    label: "Maintenance mode",
    description:
      "Shows the maintenance screen to everyone except app-wide admins.",
    defaultValue: "false",
    envFallback: "MAINTENANCE_MODE",
  },

  // ── Authentication ─────────────────────────────────────────────────────
  {
    key: "auth.method",
    category: "auth",
    type: "enum",
    label: "Primary authentication method",
    description:
      "Which identity source the login screen offers. Email/password always remains available to app-wide admins so a misconfigured directory cannot lock everyone out.",
    defaultValue: "password",
    options: AUTH_METHODS,
  },
  {
    key: "auth.allowPasswordLogin",
    category: "auth",
    type: "boolean",
    label: "Allow email/password login",
    description:
      "Keep enabled while testing a directory integration. Has no effect for app-wide admins, who can always sign in this way.",
    defaultValue: "true",
  },
  {
    key: "auth.disableSignup",
    category: "auth",
    type: "boolean",
    label: "Disable self-registration",
    description: "When enabled, accounts can only be created by invitation.",
    defaultValue: "true",
    envFallback: "DISABLE_SIGNUP",
  },

  // ── SAML ───────────────────────────────────────────────────────────────
  {
    key: "saml.enabled",
    category: "saml",
    type: "boolean",
    label: "Enable SAML 2.0",
    defaultValue: "false",
  },
  {
    key: "saml.entryPoint",
    category: "saml",
    type: "string",
    label: "IdP sign-on URL",
    description: "Where users are redirected to authenticate.",
    defaultValue: "",
  },
  {
    key: "saml.issuer",
    category: "saml",
    type: "string",
    label: "Service provider entity ID",
    defaultValue: "",
  },
  {
    key: "saml.certificate",
    category: "saml",
    type: "string",
    label: "IdP signing certificate",
    description: "PEM-encoded public certificate used to verify assertions.",
    defaultValue: "",
    isSecret: true,
  },
  {
    key: "saml.emailAttribute",
    category: "saml",
    type: "string",
    label: "Email attribute",
    defaultValue: "email",
  },
  {
    key: "saml.groupsAttribute",
    category: "saml",
    type: "string",
    label: "Groups attribute",
    description:
      "Claim carrying group membership, mapped to workspace roles on SsoDetails.",
    defaultValue: "groups",
  },

  // ── OIDC ───────────────────────────────────────────────────────────────
  {
    key: "oidc.enabled",
    category: "oidc",
    type: "boolean",
    label: "Enable OpenID Connect",
    defaultValue: "false",
  },
  {
    key: "oidc.issuerUrl",
    category: "oidc",
    type: "string",
    label: "Issuer URL",
    description:
      "Base URL of the provider, e.g. https://login.microsoftonline.com/<tenant>/v2.0",
    defaultValue: "",
  },
  {
    key: "oidc.clientId",
    category: "oidc",
    type: "string",
    label: "Client ID",
    defaultValue: "",
  },
  {
    key: "oidc.clientSecret",
    category: "oidc",
    type: "string",
    label: "Client secret",
    defaultValue: "",
    isSecret: true,
  },
  {
    key: "oidc.scopes",
    category: "oidc",
    type: "string",
    label: "Scopes",
    description: "Space-separated. Must include openid.",
    defaultValue: "openid profile email",
  },

  // ── LDAP ───────────────────────────────────────────────────────────────
  {
    key: "ldap.enabled",
    category: "ldap",
    type: "boolean",
    label: "Enable LDAP / Active Directory",
    defaultValue: "false",
  },
  {
    key: "ldap.url",
    category: "ldap",
    type: "string",
    label: "Server URL",
    description: "e.g. ldaps://dc.epda.local:636. Prefer ldaps.",
    defaultValue: "",
  },
  {
    key: "ldap.bindDn",
    category: "ldap",
    type: "string",
    label: "Bind DN",
    description: "Service account used to search the directory.",
    defaultValue: "",
  },
  {
    key: "ldap.bindPassword",
    category: "ldap",
    type: "string",
    label: "Bind password",
    defaultValue: "",
    isSecret: true,
  },
  {
    key: "ldap.searchBase",
    category: "ldap",
    type: "string",
    label: "Search base",
    description: "e.g. ou=users,dc=epda,dc=local",
    defaultValue: "",
  },
  {
    key: "ldap.searchFilter",
    category: "ldap",
    type: "string",
    label: "Search filter",
    description: "{{username}} is replaced with the submitted login name.",
    defaultValue: "(sAMAccountName={{username}})",
  },
] as const satisfies readonly SettingDefinition[];

/** Union of every valid setting key — the write endpoint validates against it. */
export type SettingKey = (typeof SETTING_DEFINITIONS)[number]["key"];

/**
 * The same list, widened to the interface.
 *
 * `SETTING_DEFINITIONS` is `as const` so `SettingKey` can be a literal union,
 * but that makes its element type a union of 23 distinct object shapes — and an
 * entry without `description` genuinely lacks the property, so
 * `definition.description` does not typecheck against the union. Iterate this
 * instead; use the const version only for the key type.
 */
export const ALL_SETTINGS: readonly SettingDefinition[] = SETTING_DEFINITIONS;

/** Key → definition, for O(1) validation on write. */
export const SETTINGS_BY_KEY = new Map<string, SettingDefinition>(
  ALL_SETTINGS.map((definition) => [definition.key, definition]),
);

/**
 * Narrows an arbitrary string to a known setting key.
 *
 * @param key - Candidate key, typically from a request body
 * @returns Whether the registry defines it
 */
export function isKnownSettingKey(key: string): key is SettingKey {
  return SETTINGS_BY_KEY.has(key);
}

/** Placeholder returned instead of a secret's value in API responses. */
export const REDACTED = "••••••••" as const;
