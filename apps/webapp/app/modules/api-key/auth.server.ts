/**
 * API-key authentication for the external integration API.
 *
 * Every `/api/v1/*` route begins with {@link requireApiKey}. It is the single
 * chokepoint where a credential is validated, its scope checked, and the
 * organization it may act within resolved — which is why the v1 routes never
 * accept an `organizationId` from the caller. The credential determines the
 * workspace; the request cannot.
 *
 * That is the difference between this and the mobile API (`requireMobileAuth`),
 * where a user's token can reach several workspaces and the client picks one.
 *
 * @see {@link file://./service.server.ts} issuing and revoking
 * @see {@link file://./scopes.ts} the scope vocabulary
 */

import type { ApiKey } from "@prisma/client";
import { db } from "~/database/db.server";
import { hashApiToken } from "~/utils/crypto.server";
import { ShelfError } from "~/utils/error";
import type { ApiKeyScope } from "./scopes";

const label = "API Key" as const;

/**
 * How stale `lastUsedAt` may get before it is refreshed.
 *
 * Without this a busy integration writes a row on every call. One minute is
 * enough resolution to answer "is this key still in use?", which is the only
 * question the field exists to answer.
 */
const USAGE_TOUCH_INTERVAL_MS = 60_000;

/** What an authenticated v1 route gets to work with. */
export type ApiKeyContext = {
  /** The workspace every query in this request must be scoped to. */
  organizationId: string;
  apiKeyId: string;
  scopes: string[];
  /**
   * The admin who issued the key. Service functions that write require a
   * `userId` for attribution and activity events; an API key has no session, so
   * writes are recorded against the person who authorised the integration.
   * That is the honest answer to "who did this" — someone decided this system
   * could act here.
   */
  actingUserId: string;
};

/**
 * Extracts the token from the request.
 *
 * Two forms are accepted because integration platforms differ in what they can
 * send: `Authorization: Bearer <token>` and `x-api-key: <token>`. The token is
 * never read from the query string — URLs end up in access logs, proxy logs and
 * browser history.
 *
 * @param request - The incoming request
 * @returns The raw token, or null if neither header carries one
 */
function extractToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");

  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }

  const headerKey = request.headers.get("x-api-key")?.trim();
  return headerKey || null;
}

/**
 * Refreshes `lastUsedAt`, debounced and fire-and-forget.
 *
 * Never awaited and never allowed to reject: usage telemetry must not be able
 * to fail a request that was otherwise authenticated correctly.
 *
 * @param key - The key row just authenticated
 */
function touchApiKeyUsage(key: Pick<ApiKey, "id" | "lastUsedAt">): void {
  const now = Date.now();

  if (
    key.lastUsedAt &&
    now - key.lastUsedAt.getTime() < USAGE_TOUCH_INTERVAL_MS
  ) {
    return;
  }

  void db.apiKey
    // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: `key.id` came from the digest lookup in requireApiKey, not from the request. There is no caller-supplied id to confuse, and the key IS the organization scope here rather than being scoped by one.
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date(now) } })
    .catch(() => {
      // Deliberately swallowed — see the doc comment.
    });
}

/**
 * Authenticates an external API request and asserts a scope.
 *
 * Every failure returns the same generic message. Distinguishing "no such key"
 * from "revoked" from "wrong scope" would let a caller probe which tokens exist;
 * the operator gets the detail from the audit trail instead.
 *
 * @param request - The incoming request
 * @param scope - The capability this endpoint requires
 * @returns The organization and key context for the rest of the handler
 * @throws {ShelfError} 401 when the credential is missing, unknown, revoked or
 *   expired; 403 when it lacks the required scope
 */
export async function requireApiKey(
  request: Request,
  scope: ApiKeyScope,
): Promise<ApiKeyContext> {
  const unauthorized = (reason: string) =>
    new ShelfError({
      cause: null,
      message: "Invalid or missing API key.",
      // The specific reason goes to the logs, not to the caller.
      additionalData: { reason },
      label,
      status: 401,
      shouldBeCaptured: false,
    });

  const token = extractToken(request);

  if (!token) {
    throw unauthorized("no-token");
  }

  // Lookup is by digest, so the plaintext token never reaches the database and
  // no scan over candidate rows is needed.
  const key = await db.apiKey.findUnique({
    where: { hashedKey: hashApiToken(token) },
    select: {
      id: true,
      organizationId: true,
      createdById: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });

  if (!key) {
    throw unauthorized("unknown-key");
  }

  if (key.revokedAt) {
    throw unauthorized("revoked");
  }

  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
    throw unauthorized("expired");
  }

  if (!key.scopes.includes(scope)) {
    throw new ShelfError({
      cause: null,
      message: `This API key does not have the required scope: ${scope}`,
      additionalData: { apiKeyId: key.id, required: scope },
      label,
      status: 403,
      shouldBeCaptured: false,
    });
  }

  touchApiKeyUsage(key);

  return {
    organizationId: key.organizationId,
    apiKeyId: key.id,
    scopes: key.scopes,
    actingUserId: key.createdById,
  };
}
