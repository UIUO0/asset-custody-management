import type {
  Asset,
  AuditSession,
  Category,
  Currency,
  Note,
  Prisma,
  User,
} from "@prisma/client";
import type { ConsumptionType } from "@prisma/client";
import { db } from "~/database/db.server";
import {
  buildCategoryChangeNote,
  buildDescriptionChangeNote,
  buildNameChangeNote,
  buildValuationChangeNote,
  resolveUserLink,
} from "~/modules/note/helpers.server";
import type { LoadUserForNotesFn } from "~/modules/note/load-user-for-notes.server";
export type { BasicUserName } from "~/modules/note/load-user-for-notes.server";
import { NOTE_TYPE_FILTER_MAP } from "~/modules/note/note-filters";
import { sanitizeUnitOfMeasureLabel } from "~/utils/asset-quantity";
import { updateCookieWithPerPage } from "~/utils/cookies.server";
import { ShelfError } from "~/utils/error";
import { getCurrentSearchParams } from "~/utils/http.server";
import { getParamsValues } from "~/utils/list";
import { wrapLinkForNote, wrapUserLinkForNote } from "~/utils/markdoc-wrappers";
import {
  assertAssetsBelongToOrg,
  type OrgValidationTxClient,
} from "~/utils/org-validation.server";

const label = "Note";

/**
 * Minimal Prisma surface `createNotes` needs when run inside a transaction.
 * Extends {@link OrgValidationTxClient} (so the same `tx` can be forwarded to
 * `assertAssetsBelongToOrg`) with the `note.createMany` write. Typed
 * structurally because the extended transaction client is not directly
 * assignable to the generated `Prisma.TransactionClient` (same approach as
 * `RecordEventTxClient` / `OrgValidationTxClient`).
 */
export type NotesTxClient = OrgValidationTxClient & {
  note: {
    createMany: (args: {
      data: Prisma.NoteUncheckedCreateInput[];
    }) => Promise<{ count: number }>;
  };
};

/**
 * Creates a singular note.
 *
 * `organizationId` is required and validated: the target asset must belong to
 * that organization before the note is written. This prevents cross-org IDOR
 * where a caller supplies an asset ID from another tenant.
 *
 * @param params.organizationId - Caller's validated organization ID
 * @throws {ShelfError} 400 if the asset is not in `organizationId`
 */
export async function createNote({
  content,
  type,
  userId,
  assetId,
  organizationId,
}: Pick<Note, "content"> & {
  type?: Note["type"];
  userId: User["id"];
  assetId: Asset["id"];
  organizationId: string;
}) {
  try {
    await assertAssetsBelongToOrg({ assetIds: [assetId], organizationId });

    const data = {
      content,
      type: type || "COMMENT",
      user: {
        connect: {
          id: userId,
        },
      },
      asset: {
        connect: {
          id: assetId,
        },
      },
    };

    return await db.note.create({
      data,
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while creating a note",
      additionalData: { type, userId, assetId },
      label,
    });
  }
}

/**
 * Creates multiple notes with the same content.
 *
 * `organizationId` is required and validated: every target asset must belong
 * to that organization before the notes are written (cross-org IDOR guard).
 *
 * @param params.organizationId - Caller's validated organization ID
 * @param tx - Optional Prisma transaction client. When the caller already runs
 *   inside a `db.$transaction`, pass it so the org guard and the note write
 *   commit atomically with the surrounding mutation (and roll back together).
 *   Defaults to the global `db`.
 * @throws {ShelfError} 400 if any asset is not in `organizationId`
 */
export async function createNotes(
  {
    content,
    type,
    userId,
    assetIds,
    organizationId,
  }: Pick<Note, "content"> & {
    type?: Note["type"];
    userId: User["id"];
    assetIds: Asset["id"][];
    organizationId: string;
  },
  tx?: NotesTxClient,
) {
  try {
    const client = tx ?? db;

    await assertAssetsBelongToOrg({ assetIds, organizationId }, tx);

    const data = assetIds.map((id) => ({
      content,
      type: type || "COMMENT",
      userId,
      assetId: id,
    }));

    return await client.note.createMany({
      data,
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while creating notes",
      additionalData: { type, userId, assetIds },
      label,
    });
  }
}

export async function deleteNote({
  id,
  userId,
}: Pick<Note, "id"> & { userId: User["id"] }) {
  try {
    return await db.note.deleteMany({
      where: { id, userId },
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while deleting the note",
      additionalData: { id, userId },
      label,
    });
  }
}

/**
 * Loads a single asset's notes (its activity log) with pagination, free-text
 * search, and a note-type filter — so the activity tab reuses the same list
 * mechanics (`<Filters>`, `<StatusFilter>`, `<Pagination>`) as the rest of the
 * app instead of rendering every note unbounded.
 *
 * Reads the standard list query params from the request:
 * - `page` / `per_page` — pagination ({@link getParamsValues} + {@link updateCookieWithPerPage})
 * - `s` — free-text search, matched against note content and the author's name
 * - `noteType` — "Comments" (human `COMMENT` notes) or "Updates" (system
 *   `UPDATE` notes); any other value (incl. absent / "ALL") returns both.
 *
 * The total count is resolved BEFORE the page is fetched so the requested
 * The requested `page` is clamped to the last populated page: an out-of-range
 * page (deleting the last note on a page, or a stale bookmarked `?page=N`)
 * returns that page instead of an empty list that reads as a false "No Notes"
 * empty state. The clamped value is what's returned as `page`. `totalPages`
 * itself follows the shared list contract (`0` when nothing matches).
 *
 * `organizationId` is required and scopes the query via `asset.organizationId`,
 * so a note can never be read across tenants even if a foreign `assetId` is
 * supplied (see `.claude/rules/org-scope-user-supplied-ids.md`).
 *
 * @returns Pagination metadata plus the page of notes (`items`, newest first),
 *   `hasNotes` (whether the asset has ANY notes ignoring the active filter — so
 *   the UI can keep the "Export activity CSV" action visible even when a filter
 *   matches zero notes), and the `cookie` for the loader to serialize as a
 *   `Set-Cookie` header (persists the per-page preference).
 * @throws {ShelfError} If the database query fails.
 */
export async function getPaginatedAndFilterableAssetNotes({
  assetId,
  organizationId,
  request,
}: {
  assetId: Asset["id"];
  organizationId: string;
  request: Request;
}) {
  const searchParams = getCurrentSearchParams(request);
  const { page, perPageParam, search } = getParamsValues(searchParams);

  const typeFilter = NOTE_TYPE_FILTER_MAP[searchParams.get("noteType") ?? ""];

  const cookie = await updateCookieWithPerPage(request, perPageParam);
  const { perPage } = cookie;

  try {
    /**
     * Normalize the page size once and use it for the query, the skip offset,
     * and the returned metadata so `perPage`/`totalPages` always describe the
     * page we actually fetched (200 is the established out-of-range fallback).
     */
    const safePerPage = perPage >= 1 && perPage <= 100 ? perPage : 200;

    /** Scope by the asset AND its organization (cross-tenant read guard) */
    const where: Prisma.NoteWhereInput = {
      assetId,
      asset: { organizationId },
    };

    if (typeFilter) {
      where.type = typeFilter;
    }

    if (search) {
      /**
       * Match the search term against the note body or the author's name.
       * `displayName` is included because the note card shows it (via
       * `resolveUserDisplayName`) for SSO users, so a search for the visible
       * author name must match it too.
       */
      where.OR = [
        { content: { contains: search, mode: "insensitive" } },
        {
          user: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { displayName: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    // Count first so the requested page can be clamped into range before the
    // page is fetched (see JSDoc). `totalPages` follows the shared list contract
    // (`0` when nothing matches, like the other paginated services), so clamp
    // against a separate `lastPage` ceiling instead of inflating the metadata.
    const totalItems = await db.note.count({ where });
    const totalPages = Math.ceil(totalItems / safePerPage);
    // Clamp the requested page into [1, lastPage] so an out-of-range page
    // (e.g. deleting the last note on a page, or a stale bookmarked ?page=N)
    // still returns a populated page instead of an empty list.
    const lastPage = Math.max(1, totalPages);
    const currentPage = Math.min(Math.max(page, 1), lastPage);
    const skip = (currentPage - 1) * safePerPage;

    const notes = await db.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: safePerPage,
      include: {
        user: {
          select: { firstName: true, lastName: true, displayName: true },
        },
      },
    });

    /**
     * Whether the asset has ANY notes, ignoring the active filter — lets the UI
     * keep the "Export activity CSV" action visible when a filter matches zero
     * notes (an empty filtered view is not an empty activity log). Only pay for
     * the extra unfiltered count when a filter is active; otherwise `totalItems`
     * already is the unfiltered total.
     */
    const hasActiveFilter = Boolean(typeFilter || search);
    const hasNotes = hasActiveFilter
      ? (await db.note.count({
          where: { assetId, asset: { organizationId } },
        })) > 0
      : totalItems > 0;

    return {
      page: currentPage,
      perPage: safePerPage,
      search,
      items: notes,
      totalItems,
      totalPages,
      hasNotes,
      cookie,
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while fetching the asset's notes",
      additionalData: { assetId, organizationId },
      label,
    });
  }
}

/**
 * Persist a note capturing asset name changes using the text diff helper.
 */
export async function createAssetNameChangeNote({
  assetId,
  userId,
  organizationId,
  previousName,
  newName,
  loadUserForNotes,
}: {
  assetId: Asset["id"];
  userId: User["id"];
  /** Caller's validated org — propagated to the note's asset ownership check */
  organizationId: string;
  previousName?: string | null;
  newName?: string | null;
  loadUserForNotes: LoadUserForNotesFn;
}) {
  const userLink = await resolveUserLink({ userId, loadUserForNotes });
  const content = buildNameChangeNote({
    userLink,
    previous: previousName,
    next: newName,
  });

  if (!content) {
    return;
  }

  await createNote({
    content,
    type: "UPDATE",
    userId,
    assetId,
    organizationId,
  });
}

/**
 * Persist a note describing updates to the asset description.
 */
export async function createAssetDescriptionChangeNote({
  assetId,
  userId,
  organizationId,
  previousDescription,
  newDescription,
  loadUserForNotes,
}: {
  assetId: Asset["id"];
  userId: User["id"];
  /** Caller's validated org — propagated to the note's asset ownership check */
  organizationId: string;
  previousDescription?: string | null;
  newDescription?: string | null;
  loadUserForNotes: LoadUserForNotesFn;
}) {
  const userLink = await resolveUserLink({ userId, loadUserForNotes });
  const content = buildDescriptionChangeNote({
    userLink,
    previous: previousDescription,
    next: newDescription,
  });

  if (!content) {
    return;
  }

  await createNote({
    content,
    type: "UPDATE",
    userId,
    assetId,
    organizationId,
  });
}

/**
 * Persist a note when the asset category is added, changed, or removed.
 */
export async function createAssetCategoryChangeNote({
  assetId,
  userId,
  organizationId,
  previousCategory,
  newCategory,
  loadUserForNotes,
}: {
  assetId: Asset["id"];
  userId: User["id"];
  /** Caller's validated org — propagated to the note's asset ownership check */
  organizationId: string;
  previousCategory?: Pick<Category, "id" | "name" | "color"> | null;
  newCategory?: Pick<Category, "id" | "name" | "color"> | null;
  loadUserForNotes: LoadUserForNotesFn;
}) {
  const userLink = await resolveUserLink({ userId, loadUserForNotes });
  const content = buildCategoryChangeNote({
    userLink,
    previous: previousCategory,
    next: newCategory,
  });

  if (!content) {
    return;
  }

  await createNote({
    content,
    type: "UPDATE",
    userId,
    assetId,
    organizationId,
  });
}

/**
 * Persist a note highlighting valuation adjustments with formatted currency values.
 */
export async function createAssetValuationChangeNote({
  assetId,
  userId,
  organizationId,
  previousValuation,
  newValuation,
  currency,
  locale,
  loadUserForNotes,
}: {
  assetId: Asset["id"];
  userId: User["id"];
  /** Caller's validated org — propagated to the note's asset ownership check */
  organizationId: string;
  previousValuation?: Prisma.Decimal | number | null;
  newValuation?: Prisma.Decimal | number | null;
  currency: Currency;
  locale: string;
  loadUserForNotes: LoadUserForNotesFn;
}) {
  const userLink = await resolveUserLink({ userId, loadUserForNotes });
  const content = buildValuationChangeNote({
    userLink,
    previous: previousValuation,
    next: newValuation,
    currency,
    locale,
  });

  if (!content) {
    return;
  }

  await createNote({
    content,
    type: "UPDATE",
    userId,
    assetId,
    organizationId,
  });
}

/**
 * Create asset notes when assets are added to an audit
 */
export async function createAssetNotesForAuditAddition({
  assetIds,
  userId,
  audit,
  organizationId,
}: {
  assetIds: Asset["id"][];
  userId: User["id"];
  audit: Pick<AuditSession, "id" | "name">;
  /** Caller's validated org — propagated to the note's asset ownership check */
  organizationId: string;
}) {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, displayName: true },
    });

    if (!user || assetIds.length === 0) return;

    const userLink = wrapUserLinkForNote({
      id: user.id,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    });

    const auditLink = wrapLinkForNote(
      `/audits/${audit.id}/overview`,
      audit.name,
    );

    const content = `${userLink} added asset to audit ${auditLink}.`;

    await createNotes({
      content,
      type: "UPDATE",
      userId,
      assetIds,
      organizationId,
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message:
        "Something went wrong while creating asset notes for audit addition",
      additionalData: { userId, assetIds, auditId: audit.id },
      label,
    });
  }
}

/**
 * Create asset notes when assets are removed from an audit
 */
export async function createAssetNotesForAuditRemoval({
  assetIds,
  userId,
  audit,
  organizationId,
}: {
  assetIds: Asset["id"][];
  userId: User["id"];
  audit: Pick<AuditSession, "id" | "name">;
  /** Caller's validated org — propagated to the note's asset ownership check */
  organizationId: string;
}) {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, displayName: true },
    });

    if (!user || assetIds.length === 0) return;

    const userLink = wrapUserLinkForNote({
      id: user.id,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
    });

    const auditLink = wrapLinkForNote(
      `/audits/${audit.id}/overview`,
      audit.name,
    );

    const content = `${userLink} removed asset from audit ${auditLink}.`;

    await createNotes({
      content,
      type: "UPDATE",
      userId,
      assetIds,
      organizationId,
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message:
        "Something went wrong while creating asset notes for audit removal",
      additionalData: { userId, assetIds, auditId: audit.id },
      label,
    });
  }
}

/** Human-readable label for ConsumptionType values */
function consumptionTypeLabel(
  type: ConsumptionType | null | undefined,
): string {
  if (type === "ONE_WAY") return "Used up (one-way)";
  if (type === "TWO_WAY") return "Returnable (two-way)";
  return "—";
}

/**
 * Persist a note when quantity-related fields are changed via the edit form.
 *
 * Tracks changes to: quantity, minQuantity, consumptionType, unitOfMeasure.
 * Only creates a note when at least one field actually changed.
 */
export async function createAssetQuantityChangeNote({
  assetId,
  organizationId,
  userId,
  previousQuantity,
  newQuantity,
  previousMinQuantity,
  newMinQuantity,
  previousConsumptionType,
  newConsumptionType,
  previousUnitOfMeasure,
  newUnitOfMeasure,
  loadUserForNotes,
}: {
  assetId: Asset["id"];
  /** Caller's validated org — propagated to the note's asset ownership check */
  organizationId: string;
  userId: User["id"];
  previousQuantity?: number | null;
  newQuantity?: number | null;
  previousMinQuantity?: number | null;
  newMinQuantity?: number | null;
  previousConsumptionType?: ConsumptionType | null;
  newConsumptionType?: ConsumptionType | null;
  previousUnitOfMeasure?: string | null;
  newUnitOfMeasure?: string | null;
  loadUserForNotes: LoadUserForNotesFn;
}) {
  const changes: string[] = [];

  if (
    newQuantity !== undefined &&
    (previousQuantity ?? null) !== (newQuantity ?? null)
  ) {
    changes.push(
      `total quantity from **${previousQuantity ?? "—"}** to **${
        newQuantity ?? "—"
      }**`,
    );
  }

  if (
    newMinQuantity !== undefined &&
    (previousMinQuantity ?? null) !== (newMinQuantity ?? null)
  ) {
    changes.push(
      `low-stock threshold from **${previousMinQuantity ?? "—"}** to **${
        newMinQuantity ?? "—"
      }**`,
    );
  }

  if (
    newConsumptionType !== undefined &&
    (previousConsumptionType ?? null) !== (newConsumptionType ?? null)
  ) {
    changes.push(
      `behavior from **${consumptionTypeLabel(
        previousConsumptionType,
      )}** to **${consumptionTypeLabel(newConsumptionType)}**`,
    );
  }

  if (
    newUnitOfMeasure !== undefined &&
    (previousUnitOfMeasure ?? null) !== (newUnitOfMeasure ?? null)
  ) {
    const prevLabel = sanitizeUnitOfMeasureLabel(previousUnitOfMeasure) || "—";
    const nextLabel = sanitizeUnitOfMeasureLabel(newUnitOfMeasure) || "—";
    changes.push(`unit of measure from **${prevLabel}** to **${nextLabel}**`);
  }

  if (changes.length === 0) return;

  const userLink = await resolveUserLink({ userId, loadUserForNotes });
  const content = `${userLink} updated ${changes.join(", ")}.`;

  await createNote({
    content,
    type: "UPDATE",
    userId,
    assetId,
    organizationId,
  });
}
