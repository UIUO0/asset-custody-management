/**
 * Issuing, listing and revoking API keys.
 *
 * The token is generated here and returned to the caller exactly once. Only its
 * SHA-256 digest is stored, so a database dump does not yield working
 * credentials and a lost key can only be replaced, never recovered — which is
 * the property that makes "revoke and reissue" the honest answer when someone
 * asks for a forgotten key.
 *
 * Issuance is restricted to app-wide admins at the route layer. This module
 * enforces the data rules: org scoping, scope validation, and the soft-delete
 * shape of revocation.
 *
 * @see {@link file://./auth.server.ts} how a key is checked on the way in
 * @see {@link file://./scopes.ts} the scope vocabulary
 */

import { randomBytes } from "node:crypto";
import type { ApiKey } from "@prisma/client";
import { db } from "~/database/db.server";
import { hashApiToken } from "~/utils/crypto.server";
import { ShelfError } from "~/utils/error";
import {
  API_KEY_TOKEN_PREFIX,
  isApiKeyScope,
  type ApiKeyScope,
} from "./scopes";

const label = "API Key" as const;

/** Entropy of the secret portion. 32 bytes ≙ 256 bits. */
const TOKEN_BYTES = 32;

/** Characters of the secret kept in `prefix` for display. */
const PREFIX_LENGTH = 8;

/** An API key as shown in the admin list — never includes the token. */
export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  organizationId: string;
  organizationName: string;
  createdByEmail: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  /** Derived: revoked, expired, or live. Saves every caller recomputing it. */
  status: "active" | "revoked" | "expired";
};

/**
 * Classifies a key for display.
 *
 * Revocation outranks expiry: a key that was revoked *and* has since passed its
 * expiry should still read as "revoked", because that is the action someone took.
 */
function deriveStatus(key: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): ApiKeySummary["status"] {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return "expired";
  return "active";
}

/** Shapes a Prisma row (with its relations) into the list view. */
function toSummary(
  key: ApiKey & {
    organization: { name: string };
    createdBy: { email: string } | null;
  },
): ApiKeySummary {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    organizationId: key.organizationId,
    organizationName: key.organization.name,
    createdByEmail: key.createdBy?.email ?? null,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    status: deriveStatus(key),
  };
}

/**
 * Lists every API key across all workspaces.
 *
 * Not org-scoped, because the only caller is the app-wide admin screen — the
 * point of that screen is to see every credential that exists.
 *
 * @returns Keys newest first, tokens excluded
 * @throws {ShelfError} If the query fails
 */
export async function listApiKeys(): Promise<ApiKeySummary[]> {
  try {
    const keys = await db.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        organization: { select: { name: true } },
        createdBy: { select: { email: true } },
      },
    });

    return keys.map(toSummary);
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Failed to load API keys.",
      label,
    });
  }
}

/**
 * Issues a new API key.
 *
 * @param args.name - Human label, e.g. "ERP nightly sync"
 * @param args.organizationId - Workspace the key may act within
 * @param args.scopes - Requested capabilities; must all be known
 * @param args.userId - The app-wide admin issuing the key
 * @param args.expiresAt - Optional hard expiry
 * @returns The summary plus `token` — the only time the token is ever available
 * @throws {ShelfError} 400 for an unknown scope or empty scope list, 404 if the
 *   organization does not exist
 */
export async function createApiKey({
  name,
  organizationId,
  scopes,
  userId,
  expiresAt,
}: {
  name: string;
  organizationId: string;
  scopes: string[];
  userId: string;
  expiresAt?: Date | null;
}): Promise<ApiKeySummary & { token: string }> {
  // A key with no scopes would authenticate but authorize nothing — almost
  // certainly a mistake in the calling form, so refuse it rather than issue a
  // credential that fails confusingly at every endpoint.
  if (scopes.length === 0) {
    throw new ShelfError({
      cause: null,
      message: "An API key must have at least one scope.",
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const unknown = scopes.filter((scope) => !isApiKeyScope(scope));

  if (unknown.length > 0) {
    throw new ShelfError({
      cause: null,
      message: `Unknown scope(s): ${unknown.join(", ")}`,
      additionalData: { unknown },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });

  if (!organization) {
    throw new ShelfError({
      cause: null,
      message: "Workspace not found.",
      additionalData: { organizationId },
      label,
      status: 404,
      shouldBeCaptured: false,
    });
  }

  // base64url so the token is safe in a header, a query string and a shell
  // variable without escaping.
  const secret = randomBytes(TOKEN_BYTES).toString("base64url");
  const prefix = `${API_KEY_TOKEN_PREFIX}_${secret.slice(0, PREFIX_LENGTH)}`;
  const token = `${API_KEY_TOKEN_PREFIX}_${secret}`;

  try {
    const key = await db.apiKey.create({
      data: {
        name,
        prefix,
        hashedKey: hashApiToken(token),
        scopes,
        organizationId,
        createdById: userId,
        expiresAt: expiresAt ?? null,
      },
      include: {
        organization: { select: { name: true } },
        createdBy: { select: { email: true } },
      },
    });

    return { ...toSummary(key), token };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Failed to create the API key.",
      additionalData: { organizationId, name },
      label,
    });
  }
}

/**
 * Revokes a key.
 *
 * A soft delete: the row survives so the record of who issued what, and when it
 * was last used, outlives the revocation. Revoking an already-revoked key is a
 * no-op rather than an error, so a double-click cannot rewrite the timestamp.
 *
 * @param args.id - Key id
 * @returns The updated summary
 * @throws {ShelfError} 404 if no such key exists
 */
export async function revokeApiKey({
  id,
}: {
  id: string;
}): Promise<ApiKeySummary> {
  const existing = await db.apiKey.findUnique({
    // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: revocation is an app-wide admin action, deliberately not scoped to one workspace. The only callers gate on requireAdmin (Roles.ADMIN), and an admin who can see every key in the list must be able to revoke any of them. Narrowing by organizationId here would mean an admin could list a key and then fail to revoke it.
    where: { id },
    select: { id: true, revokedAt: true },
  });

  if (!existing) {
    throw new ShelfError({
      cause: null,
      message: "API key not found.",
      additionalData: { id },
      label,
      status: 404,
      shouldBeCaptured: false,
    });
  }

  try {
    const key = await db.apiKey.update({
      // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: same reason as the lookup above — app-wide admin action. `update` also requires a unique where, and there is no (id, organizationId) compound unique to narrow on.
      where: { id },
      data: { revokedAt: existing.revokedAt ?? new Date() },
      include: {
        organization: { select: { name: true } },
        createdBy: { select: { email: true } },
      },
    });

    return toSummary(key);
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Failed to revoke the API key.",
      additionalData: { id },
      label,
    });
  }
}

/**
 * Workspaces an admin can bind a key to, for the creation form's picker.
 *
 * @returns Every organization, id and name only
 */
export async function getOrganizationsForApiKeyForm(): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    return await db.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Failed to load workspaces.",
      label,
    });
  }
}

/** Re-exported so route modules import scope types from one place. */
export type { ApiKeyScope };
