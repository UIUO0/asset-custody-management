/**
 * Reading and writing instance-wide settings.
 *
 * Resolution order for any key is: stored row → environment fallback →
 * registry default. The environment step is what makes this table optional —
 * a deployment that has never opened the settings screen keeps behaving exactly
 * as its `.env` says, and the first save takes precedence from then on.
 *
 * Two read paths exist, and the distinction is the security boundary of this
 * module:
 *
 * - {@link getSettingsForAdmin} — for the settings screen and its API. Secrets
 *   come back as {@link REDACTED}; their plaintext never leaves the server.
 * - {@link getResolvedSettings} — for server-side consumers that need the real
 *   values (`getAuthConfig`, the eventual directory clients). Never serialize
 *   its output into a loader payload.
 *
 * @see {@link file://./registry.ts} which settings exist
 * @see {@link file://./../../routes/api+/admin.settings.ts} the HTTP surface
 */

import type { AppSetting } from "@prisma/client";
import { db } from "~/database/db.server";
import { decryptSecret, encryptSecret } from "~/utils/crypto.server";
import { ShelfError } from "~/utils/error";
import {
  REDACTED,
  SETTINGS_BY_KEY,
  ALL_SETTINGS,
  isKnownSettingKey,
  type SettingCategory,
  type SettingDefinition,
} from "./registry";

const label = "Settings" as const;

/** A setting as presented to an admin — value redacted when secret. */
export type AdminSettingView = {
  key: string;
  category: SettingCategory;
  type: SettingDefinition["type"];
  label: string;
  description?: string;
  options?: readonly string[];
  isSecret: boolean;
  /** Redacted for secrets. Never the stored ciphertext. */
  value: string;
  /** Whether a secret currently holds a value, since `value` cannot say so. */
  hasValue: boolean;
  /** Whether the effective value comes from a stored row rather than a default. */
  isOverridden: boolean;
};

/**
 * Resolves the raw stored value for one definition.
 *
 * @param definition - Registry entry
 * @param row - Matching `AppSetting` row, if any
 * @returns Effective plaintext value, decrypting secrets when needed
 */
function resolveValue(
  definition: SettingDefinition,
  row: AppSetting | undefined,
): string {
  // A row whose value is null means "explicitly cleared" and deliberately falls
  // through to the same fallbacks as a missing row — clearing a field in the UI
  // should restore configured behaviour, not produce an empty string.
  if (row && row.value !== null) {
    if (!row.isSecret) return row.value;

    // Unreadable secrets (typically a rotated SESSION_SECRET under the key
    // derivation fallback) degrade to "unset" so the admin can re-enter them.
    // See crypto.server.ts for why decryptSecret returns null instead of throwing.
    return decryptSecret(row.value) ?? "";
  }

  if (definition.envFallback) {
    const fromEnv = process.env[definition.envFallback];
    if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  }

  return definition.defaultValue;
}

/** Loads every stored row, keyed for lookup. Unknown keys are dropped here. */
async function loadRows(): Promise<Map<string, AppSetting>> {
  try {
    const rows = await db.appSetting.findMany();
    return new Map(
      rows
        .filter((row) => isKnownSettingKey(row.key))
        .map((row) => [row.key, row]),
    );
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Failed to load application settings.",
      label,
    });
  }
}

/**
 * Every setting with its effective plaintext value.
 *
 * **Server-only.** The returned map contains decrypted secrets — do not put it
 * in a loader payload or an API response.
 *
 * @returns Key → effective value, covering every registry entry
 */
export async function getResolvedSettings(): Promise<Map<string, string>> {
  const rows = await loadRows();

  return new Map(
    ALL_SETTINGS.map((definition) => [
      definition.key,
      resolveValue(definition, rows.get(definition.key)),
    ]),
  );
}

/**
 * A single setting's effective plaintext value.
 *
 * Prefer {@link getResolvedSettings} when reading more than one key — this
 * issues a query per call.
 *
 * @param key - A registry key
 * @returns The effective value
 * @throws {ShelfError} If the key is not in the registry
 */
export async function getSetting(key: string): Promise<string> {
  const definition = SETTINGS_BY_KEY.get(key);

  if (!definition) {
    throw new ShelfError({
      cause: null,
      message: `Unknown setting: ${key}`,
      label,
      status: 400,
    });
  }

  const row = await db.appSetting.findUnique({ where: { key } });
  return resolveValue(definition, row ?? undefined);
}

/**
 * Coerces a stored string to the boolean a caller expects.
 *
 * Only the literal "true" is true, so a malformed value fails closed rather
 * than enabling a feature by accident.
 *
 * @param value - Raw setting value
 */
export function asBoolean(value: string | undefined): boolean {
  return value === "true";
}

/**
 * Every setting shaped for the admin screen, with secrets redacted.
 *
 * @returns One view per registry entry, in registry order
 */
export async function getSettingsForAdmin(): Promise<AdminSettingView[]> {
  const rows = await loadRows();

  return ALL_SETTINGS.map((definition) => {
    const row = rows.get(definition.key);
    const resolved = resolveValue(definition, row);
    const isSecret = definition.isSecret === true;

    return {
      key: definition.key,
      category: definition.category,
      type: definition.type,
      label: definition.label,
      description: definition.description,
      options: definition.options,
      isSecret,
      // Redaction happens here rather than at the route so every caller of this
      // function inherits it — including any future one that forgets to think
      // about it.
      value: isSecret ? (resolved ? REDACTED : "") : resolved,
      hasValue: resolved !== "",
      isOverridden: row !== undefined && row.value !== null,
    };
  });
}

/** One key/value pair submitted for update. */
export type SettingUpdate = { key: string; value: string | null };

/**
 * Writes a batch of settings.
 *
 * Rules that make partial or hostile input safe:
 *
 * - Unknown keys are rejected outright — the whole batch fails rather than
 *   silently applying the recognised half.
 * - A secret submitted as the redaction placeholder is skipped, not stored.
 *   The admin form round-trips `••••••••` for untouched secret fields, and
 *   without this the first save of the page would overwrite every secret with
 *   the placeholder text.
 * - Values are validated against the definition's type before storage, so a
 *   boolean setting can never come to hold "maybe".
 *
 * The batch runs in a transaction: settings are read together (an auth method
 * and its credentials are only meaningful as a set), so they are written
 * together too.
 *
 * @param args.updates - The key/value pairs to apply
 * @param args.userId - The app-wide admin performing the change, recorded on each row
 * @returns The number of rows written
 * @throws {ShelfError} 400 for an unknown key or a value that fails validation
 */
export async function updateSettings({
  updates,
  userId,
}: {
  updates: SettingUpdate[];
  userId: string;
}): Promise<number> {
  const writes: Array<{
    key: string;
    value: string | null;
    isSecret: boolean;
    category: string;
  }> = [];

  for (const update of updates) {
    const definition = SETTINGS_BY_KEY.get(update.key);

    if (!definition) {
      throw new ShelfError({
        cause: null,
        message: `Unknown setting: ${update.key}`,
        additionalData: { key: update.key },
        label,
        status: 400,
        shouldBeCaptured: false,
      });
    }

    const isSecret = definition.isSecret === true;

    // The form posts back the placeholder for secret fields the admin did not
    // touch. Treating it as a value would destroy the real secret.
    if (isSecret && update.value === REDACTED) continue;

    if (update.value === null || update.value === "") {
      writes.push({
        key: definition.key,
        value: null,
        isSecret,
        category: definition.category,
      });
      continue;
    }

    validateValue(definition, update.value);

    writes.push({
      key: definition.key,
      value: isSecret ? encryptSecret(update.value) : update.value,
      isSecret,
      category: definition.category,
    });
  }

  if (writes.length === 0) return 0;

  try {
    await db.$transaction(
      writes.map((write) =>
        db.appSetting.upsert({
          where: { key: write.key },
          create: {
            key: write.key,
            value: write.value,
            isSecret: write.isSecret,
            category: write.category,
            updatedById: userId,
          },
          update: {
            value: write.value,
            isSecret: write.isSecret,
            category: write.category,
            updatedById: userId,
          },
        }),
      ),
    );
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Failed to save application settings.",
      additionalData: { keys: writes.map((write) => write.key) },
      label,
    });
  }

  return writes.length;
}

/**
 * Rejects a value that does not match its definition's type.
 *
 * @param definition - Registry entry being written
 * @param value - Candidate value
 * @throws {ShelfError} 400 when the value is not valid for the type
 */
function validateValue(definition: SettingDefinition, value: string): void {
  const fail = (message: string): never => {
    throw new ShelfError({
      cause: null,
      message,
      additionalData: { key: definition.key },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  };

  switch (definition.type) {
    case "boolean":
      if (value !== "true" && value !== "false") {
        fail(`${definition.label} must be "true" or "false".`);
      }
      break;

    case "number":
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        fail(`${definition.label} must be a number.`);
      }
      break;

    case "enum":
      if (!definition.options?.includes(value)) {
        fail(
          `${definition.label} must be one of: ${definition.options?.join(
            ", ",
          )}.`,
        );
      }
      break;

    case "string":
      break;
  }
}
