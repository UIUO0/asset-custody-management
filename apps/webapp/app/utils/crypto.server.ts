/**
 * Secret-at-rest encryption for instance settings.
 *
 * `AppSetting` stores things an operator must be able to paste into a form and
 * that must not be readable straight out of the database — an LDAP bind
 * password, an OIDC client secret, a SAML signing key. Those columns pass
 * through {@link encryptSecret} on the way in and {@link decryptSecret} on the
 * way out.
 *
 * ## Envelope
 *
 * ```
 * v1.<iv base64url>.<authTag base64url>.<ciphertext base64url>
 * ```
 *
 * The version prefix exists so the format can change without a data migration:
 * a reader that meets an envelope it does not recognise fails loudly rather
 * than returning garbage. AES-256-GCM is authenticated, so tampering with a row
 * in the database surfaces as a decryption failure instead of a silently
 * altered value.
 *
 * ## Key material
 *
 * `APP_SECRETS_KEY` is the intended source. When it is absent the key is
 * derived from `SESSION_SECRET` via scrypt with a fixed application salt, which
 * keeps local development and existing deployments working with no new
 * configuration.
 *
 * **Consequence of the fallback:** rotating `SESSION_SECRET` on a deployment
 * that never set `APP_SECRETS_KEY` makes every stored secret undecryptable —
 * the settings screen will show those fields as empty and ask for them again.
 * Nothing else breaks, but set `APP_SECRETS_KEY` in production to avoid it.
 *
 * @see {@link file://./../modules/app-settings/service.server.ts} the only caller
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { ShelfError } from "./error";

const label = "Settings" as const;

/** Envelope version. Bump only alongside a reader that understands both. */
const ENVELOPE_VERSION = "v1";

/** AES-256-GCM: 32-byte key, 12-byte IV (the GCM-recommended size). */
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Fixed salt for the `SESSION_SECRET` fallback derivation.
 *
 * A constant salt is acceptable here because the input is already a
 * high-entropy secret rather than a user password — scrypt is used for domain
 * separation (so the encryption key is not literally the session secret), not
 * to resist dictionary attacks.
 */
const DERIVATION_SALT = "org:app-settings:v1";

/** Memoized so scrypt runs once per process rather than per read. */
let cachedKey: Buffer | null = null;

/**
 * Resolves the 32-byte encryption key.
 *
 * `APP_SECRETS_KEY` may be supplied as 64 hex characters (used verbatim) or as
 * any other string (hashed to 32 bytes), so an operator cannot accidentally
 * configure a key of the wrong length.
 *
 * @returns The AES-256 key
 * @throws {ShelfError} If neither `APP_SECRETS_KEY` nor `SESSION_SECRET` is set
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const explicit = process.env.APP_SECRETS_KEY;

  if (explicit) {
    cachedKey = /^[0-9a-fA-F]{64}$/.test(explicit)
      ? Buffer.from(explicit, "hex")
      : createHash("sha256").update(explicit).digest();
    return cachedKey;
  }

  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret) {
    throw new ShelfError({
      cause: null,
      message:
        "Cannot encrypt settings: neither APP_SECRETS_KEY nor SESSION_SECRET is set.",
      label,
      status: 500,
    });
  }

  cachedKey = scryptSync(sessionSecret, DERIVATION_SALT, KEY_BYTES);
  return cachedKey;
}

/**
 * Encrypts a plaintext secret into a self-describing envelope.
 *
 * @param plaintext - The value to protect. An empty string is encrypted like
 *   any other value; callers that mean "no value" should store `null` instead.
 * @returns The `v1.<iv>.<tag>.<ciphertext>` envelope
 * @throws {ShelfError} If key material is unavailable
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Reverses {@link encryptSecret}.
 *
 * Returns `null` rather than throwing when the envelope cannot be opened. That
 * is deliberate: the common cause is a rotated `SESSION_SECRET` under the
 * derivation fallback, and in that situation the settings screen should render
 * with the affected fields blank so an admin can re-enter them — not 500 and
 * lock them out of the page that fixes it.
 *
 * @param envelope - A value produced by {@link encryptSecret}
 * @returns The plaintext, or `null` if the value is unreadable
 */
export function decryptSecret(envelope: string): string | null {
  const parts = envelope.split(".");

  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    return null;
  }

  const [, ivPart, tagPart, ciphertextPart] = parts;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key, or the row was tampered with — both are "unreadable" to the
    // caller. The distinction is not actionable from the settings screen.
    return null;
  }
}

/**
 * Hashes an API token for storage and lookup.
 *
 * SHA-256 without a salt is correct here and would not be for a password:
 * the input is 256 bits of `randomBytes`, so there is no dictionary to attack
 * and no work factor worth paying on a hash computed on every API request.
 * The unsalted digest is what makes authentication a single indexed lookup.
 *
 * @param token - The full plaintext token as issued to the integration
 * @returns Lowercase hex digest
 */
export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time string comparison, for confirming a value the caller supplied
 * matches one we already hold.
 *
 * Length is compared first and leaks — that is unavoidable with this shape and
 * harmless for fixed-length digests.
 *
 * @param a - First value
 * @param b - Second value
 * @returns Whether the two are equal
 */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}
