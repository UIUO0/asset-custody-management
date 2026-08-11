/**
 * Capabilities an API key can carry.
 *
 * Scopes are checked per endpoint by `requireApiKey`, so a key issued for a
 * read-only reporting integration cannot be replayed against a write endpoint
 * even though both live under `/api/v1`.
 *
 * Read and write are separate scopes per resource rather than one scope with a
 * method check. An integration that only pulls inventory should be unable to
 * mutate it, and that has to be a property of the credential rather than of
 * how carefully the caller was configured.
 *
 * A plain module, not `.server` — the admin UI renders the scope checkboxes
 * from this list.
 *
 * @see {@link file://./auth.server.ts} enforcement
 */

/** The complete scope vocabulary. An unrecognised scope grants nothing. */
export const API_KEY_SCOPES = [
  "assets:read",
  "assets:write",
  "bookings:read",
  "bookings:write",
  "locations:read",
  "categories:read",
  "team:read",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Human labels for the admin form. */
export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  "assets:read": "Read assets",
  "assets:write": "Create and update assets",
  "bookings:read": "Read bookings",
  "bookings:write": "Create and update bookings",
  "locations:read": "Read locations",
  "categories:read": "Read categories",
  "team:read": "Read team members",
};

/**
 * Narrows an arbitrary string to a known scope.
 *
 * @param scope - Candidate scope, typically from a request body
 */
export function isApiKeyScope(scope: string): scope is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(scope);
}

/**
 * Token prefix. Makes a leaked credential identifiable in logs and greppable
 * by secret scanners, which is the reason to have one at all.
 */
export const API_KEY_TOKEN_PREFIX = "epda";
