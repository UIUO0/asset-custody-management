/**
 * Custody Handover Service (خدمة محاضر التسليم والاسترجاع)
 *
 * EPDA requires that no asset changes hands without both parties signing. This
 * module owns that rule end to end: it opens a handover record, collects one
 * signature per side, and — on the second signature — applies the custody
 * change inside the same transaction that completes the record.
 *
 * ## Why the custody change lives here and not in the route
 *
 * The naive shape is "sign, then call `assignCustody`". That leaves a completed
 * record sitting in the database waiting to be consumed, and nothing stops a
 * replayed request from consuming it twice. Folding the effect into the
 * completing transaction removes the window entirely: the record can only reach
 * `COMPLETED` once (the second `INSERT` into `CustodyHandoverSignature` is
 * guarded by a unique index), and the custody row is written in that same
 * commit. There is no "completed but not yet applied" state to exploit.
 *
 * ## Where the rule is enforced
 *
 * In this service, not in the UI. Several entry points reach the same
 * operation — the web modal, the mobile scanner, a stale tab someone left open
 * — and only the service sees all of them. Hiding a button is a hint; this is
 * the fence.
 *
 * @see {@link file://./service.server.ts} — plain custody release (pre-EPDA path)
 * @see {@link file://./../../../../../packages/database/prisma/schema.prisma} — `CustodyHandover`
 * @see {@link file://./../../../../docs/epda-custody-signatures.md}
 */

import type {
  Asset,
  Prisma,
  TeamMember,
  User,
  CustodyHandoverParty,
} from "@prisma/client";
import {
  AssetStatus,
  CustodyHandoverKind,
  CustodyHandoverState,
} from "@prisma/client";
import { db } from "~/database/db.server";
import { getSupabaseAdmin } from "~/integrations/supabase/client";
import { recordEvent } from "~/modules/activity-event/service.server";
// `partyFor` lives in a neutral module because route *components* render from
// it — importing it from here would drag this whole server module into the
// client bundle. See the docblock in `./handover.ts`.
import { partyFor } from "~/modules/custody/handover";
import { createNote } from "~/modules/note/service.server";
import { ShelfError } from "~/utils/error";
import {
  wrapCustodianForNote,
  wrapUserLinkForNote,
} from "~/utils/markdoc-wrappers";

const label = "Custody" as const;

/**
 * The client an interactive transaction hands to its callback.
 *
 * Derived from `db.$transaction` rather than written as
 * `Prisma.TransactionClient`: this project's client carries extensions, and the
 * extended transaction client is **not** assignable to the generated
 * `Prisma.TransactionClient` type. Deriving it keeps the two in step through
 * any future extension change instead of drifting into a cast.
 *
 * Same reasoning as `RecordEventTxClient` in the activity-event service.
 */
type HandoverTxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Private Supabase bucket holding signature PNGs. Never served publicly. */
export const SIGNATURE_BUCKET = "custody-signatures";

/**
 * Upper bound on a decoded signature PNG.
 *
 * A hand-drawn signature at the canvas sizes we render is a few tens of KB.
 * The cap exists so a crafted request cannot push an arbitrary payload into
 * storage through the signing endpoint; it is not a UX limit and users will
 * never hit it by signing normally.
 */
const MAX_SIGNATURE_BYTES = 512 * 1024;

/** Lifetime of the signed URL used to display a signature image. */
const SIGNATURE_URL_TTL_SECONDS = 5 * 60;

/**
 * Builds the next workspace-scoped reference for a handover (e.g.
 * `EPDA-HO-2026-0042`).
 *
 * Derived from a count rather than a sequence so the number resets per year and
 * reads like the paper form it replaces. The count is racy under concurrent
 * opens; that is deliberate — the `(organizationId, reference)` unique index is
 * the real guard, and {@link openHandover} retries on collision. A dedicated
 * counter table would trade a rare retry for a permanent write hotspot.
 *
 * @param organizationId - Workspace the reference belongs to
 * @param kind - Direction, which selects the `HO` / `RT` infix
 * @param tx - Transaction client, so the count sees the same snapshot
 * @returns The reference string
 */
async function nextReference(
  organizationId: string,
  kind: CustodyHandoverKind,
  tx: HandoverTxClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const infix = kind === CustodyHandoverKind.HANDOVER ? "HO" : "RT";

  const used = await tx.custodyHandover.count({
    where: {
      organizationId,
      kind,
      createdAt: { gte: new Date(`${year}-01-01T00:00:00.000Z`) },
    },
  });

  return `EPDA-${infix}-${year}-${String(used + 1).padStart(4, "0")}`;
}

/**
 * Opens a handover record and puts it in `AWAITING_SIGNATURES`.
 *
 * Validates that the asset is actually in a state where the requested direction
 * makes sense — you cannot open a تسليم for an asset already in someone's
 * custody, nor an استرجاع for one nobody holds. Any earlier record still
 * awaiting signatures for the same asset is voided, so an abandoned attempt
 * cannot be completed later by whoever still has the tab open.
 *
 * @param assetId - Asset changing hands
 * @param organizationId - Caller's workspace
 * @param kind - `HANDOVER` (تسليم) or `RETURN` (استرجاع)
 * @param counterpartyTeamMemberId - The employee side of the transaction
 * @param operatorUserId - Warehouse operator opening the record, or `null` when
 *   the custodian opened it themselves (see {@link openReturnRequest})
 * @param conditionNotes - Optional condition baseline printed on the محضر
 * @returns The created record, with its `reference`
 * @throws {ShelfError} 404 when the asset is not in the workspace; 409 when the
 *   asset's current custody state contradicts the requested direction
 */
export async function openHandover({
  assetId,
  organizationId,
  kind,
  counterpartyTeamMemberId,
  operatorUserId,
  conditionNotes,
}: {
  assetId: Asset["id"];
  organizationId: string;
  kind: CustodyHandoverKind;
  counterpartyTeamMemberId: TeamMember["id"];
  operatorUserId: User["id"] | null;
  conditionNotes?: string | null;
}) {
  try {
    return await db.$transaction(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, organizationId },
        select: {
          id: true,
          title: true,
          custody: { select: { id: true, teamMemberId: true } },
        },
      });

      if (!asset) {
        throw new ShelfError({
          cause: null,
          title: "Asset not found",
          message: "This asset does not exist in your workspace.",
          additionalData: { assetId, organizationId },
          label,
          status: 404,
          shouldBeCaptured: false,
        });
      }

      const heldBy = asset.custody[0]?.teamMemberId ?? null;

      if (kind === CustodyHandoverKind.HANDOVER && heldBy) {
        throw new ShelfError({
          cause: null,
          title: "Asset already in custody",
          message:
            "This asset is already in someone's custody. It has to be returned before it can be handed over again.",
          additionalData: { assetId, heldBy },
          label,
          status: 409,
          shouldBeCaptured: false,
        });
      }

      if (kind === CustodyHandoverKind.RETURN) {
        if (!heldBy) {
          throw new ShelfError({
            cause: null,
            title: "Asset is not in custody",
            message:
              "Nobody currently holds this asset, so there is nothing to return.",
            additionalData: { assetId },
            label,
            status: 409,
            shouldBeCaptured: false,
          });
        }

        if (heldBy !== counterpartyTeamMemberId) {
          throw new ShelfError({
            cause: null,
            title: "Wrong custodian",
            message:
              "The asset is in a different team member's custody. Return records must name the person actually holding it.",
            additionalData: { assetId, heldBy, counterpartyTeamMemberId },
            label,
            status: 409,
            shouldBeCaptured: false,
          });
        }
      }

      // Abandon any earlier open attempt for this asset. Without this, an
      // operator who closed the modal halfway leaves a signable record behind
      // that could later complete against a different physical handover.
      await tx.custodyHandover.updateMany({
        where: {
          assetId,
          organizationId,
          state: CustodyHandoverState.AWAITING_SIGNATURES,
        },
        data: {
          state: CustodyHandoverState.VOIDED,
          voidedAt: new Date(),
          voidedReason: "Superseded by a newer handover record.",
        },
      });

      // Retry on reference collision: two operators opening a record in the
      // same millisecond both read the same count. The unique index rejects the
      // loser, which simply recounts and takes the next number.
      for (let attempt = 0; attempt < 5; attempt++) {
        const reference = await nextReference(organizationId, kind, tx);
        try {
          return await tx.custodyHandover.create({
            data: {
              reference,
              kind,
              assetId,
              organizationId,
              counterpartyTeamMemberId,
              operatorUserId,
              conditionNotes: conditionNotes?.trim() || null,
            },
            include: { signatures: true },
          });
        } catch (cause) {
          const isUniqueViolation =
            typeof cause === "object" &&
            cause !== null &&
            (cause as { code?: string }).code === "P2002";
          if (!isUniqueViolation || attempt === 4) throw cause;
        }
      }

      // Unreachable: the loop either returns or rethrows on its last attempt.
      throw new ShelfError({
        cause: null,
        message: "Could not allocate a handover reference. Please try again.",
        additionalData: { assetId, organizationId },
        label,
      });
    });
  } catch (cause) {
    if (cause instanceof ShelfError) throw cause;
    throw new ShelfError({
      cause,
      message:
        "Something went wrong while opening the handover record. Please try again or contact support.",
      additionalData: { assetId, organizationId, kind },
      label,
    });
  }
}

/**
 * Opens a return record on the custodian's own initiative (طلب استرجاع).
 *
 * The warehouse starts a handover because it owns the stock. Nobody but the
 * holder can start a return, because only they know the asset is coming back —
 * so without this the employee had to physically find an operator before the
 * system would admit a return was happening.
 *
 * ## What authorises this
 *
 * Not a role, and not `asset.custody`. `BASE` employees hold assets without
 * holding that permission — it governs managing *other people's* custody — so
 * requiring it would lock out exactly the people this exists for.
 *
 * The authorisation is a **fact**: does the caller's team-member row currently
 * hold this asset? Checked here against the `Custody` table, so it holds for
 * every entry point and cannot be bypassed by posting a different asset id.
 * (Same reasoning as `/my-custody`: holding custody is not a permission, it is
 * something that is true about a person.)
 *
 * Idempotent by design: if a record is already open for this asset it is
 * returned as-is rather than replaced. {@link openHandover} voids earlier open
 * records, which is right when the warehouse re-opens one, and wrong here — an
 * employee tapping twice would silently void a record the warehouse had
 * already half-signed.
 *
 * @param assetId - Asset being returned
 * @param organizationId - Caller's workspace
 * @param userId - The employee initiating the return
 * @param requestReason - Why they are handing it back. **Required** — the
 *   warehouse triages this queue, and a return with no stated reason forces
 *   them to chase the person to learn what they are receiving and why
 * @param conditionNotes - Optional physical condition note for the محضر
 * @returns The open return record, new or pre-existing
 * @throws {ShelfError} 400 on an empty reason; 403 when the caller does not
 *   hold this asset
 */
export async function openReturnRequest({
  assetId,
  organizationId,
  userId,
  requestReason,
  conditionNotes,
}: {
  assetId: Asset["id"];
  organizationId: string;
  userId: User["id"];
  requestReason: string;
  conditionNotes?: string | null;
}) {
  const trimmedReason = requestReason.trim();

  // Enforced here rather than by a NOT NULL column: the same table also holds
  // warehouse-initiated handovers, which legitimately have no requester.
  if (trimmedReason.length < 3) {
    throw new ShelfError({
      cause: null,
      title: "Reason required",
      message: "Please say why you are returning this asset.",
      additionalData: { assetId, userId },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const member = await db.teamMember.findFirst({
    where: { organizationId, userId, deletedAt: null },
    select: { id: true },
  });

  const custody = member
    ? await db.custody.findFirst({
        where: {
          assetId,
          teamMemberId: member.id,
          asset: { organizationId },
        },
        select: { id: true },
      })
    : null;

  if (!custody) {
    throw new ShelfError({
      cause: null,
      title: "Not your asset to return",
      message:
        "You can only request the return of an asset that is currently in your custody.",
      additionalData: { assetId, userId, organizationId },
      label,
      status: 403,
      shouldBeCaptured: false,
    });
  }

  const alreadyOpen = await db.custodyHandover.findFirst({
    where: {
      assetId,
      organizationId,
      kind: CustodyHandoverKind.RETURN,
      state: CustodyHandoverState.AWAITING_SIGNATURES,
    },
    include: { signatures: true },
  });

  if (alreadyOpen) return alreadyOpen;

  const opened = await openHandover({
    assetId,
    organizationId,
    kind: CustodyHandoverKind.RETURN,
    counterpartyTeamMemberId: member!.id,
    // No warehouse operator: nobody at the desk opened this. Left null rather
    // than filled with the employee's id, which would misattribute the record
    // in every listing that reads `operator` as "the desk that handled this".
    operatorUserId: null,
    conditionNotes,
  });

  // Set after creation rather than threading a parameter through
  // `openHandover`: the reason only exists on this path, and adding it to the
  // shared signature would invite warehouse callers to pass one that means
  // something different.
  return db.custodyHandover.update({
    where: { id: opened.id, organizationId },
    data: { requestReason: trimmedReason },
    include: { signatures: true },
  });
}

/**
 * Decodes and validates a signature data URL produced by the signature pad.
 *
 * Rejects anything that is not a PNG data URL, and anything past
 * {@link MAX_SIGNATURE_BYTES}. Returns a `Buffer` ready for upload.
 *
 * @param dataUrl - `data:image/png;base64,...` string from the canvas
 * @returns Decoded PNG bytes
 * @throws {ShelfError} 400 when the payload is not a PNG data URL or is too large
 */
export function decodeSignatureDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim(),
  );

  if (!match) {
    throw new ShelfError({
      cause: null,
      title: "Invalid signature",
      message: "The signature could not be read. Please draw it again.",
      additionalData: {},
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const bytes = Buffer.from(match[1], "base64");

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SIGNATURE_BYTES) {
    throw new ShelfError({
      cause: null,
      title: "Invalid signature",
      message: "The signature image is empty or too large.",
      additionalData: { byteLength: bytes.byteLength },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  return bytes;
}

/**
 * Records one party's signature, and completes the handover when it is the
 * second one.
 *
 * The image is uploaded before the transaction opens, because Supabase Storage
 * cannot participate in a Postgres transaction. A failure after upload but
 * before commit therefore leaves an orphaned object in the bucket — harmless
 * (it is unreferenced and private) and preferable to the alternative, which is
 * a committed signature row pointing at an image that was never stored.
 *
 * @param handoverId - Record being signed
 * @param organizationId - Caller's workspace, re-checked here so a guessed id
 *   from another workspace cannot be signed
 * @param party - Which side is signing
 * @param declaredName - Name as typed by the signatory
 * @param signatureDataUrl - PNG data URL from the signature pad
 * @param signedByUserId - Signing user, when they have an account
 * @param ipAddress - Request IP, captured for evidentiary value
 * @param userAgent - Request user agent
 * @returns The updated record including all signatures
 * @throws {ShelfError} 404 unknown record; 409 record no longer awaiting
 *   signatures, or this party already signed
 */
export async function recordHandoverSignature({
  handoverId,
  organizationId,
  party,
  declaredName,
  signatureDataUrl,
  signedByUserId,
  ipAddress,
  userAgent,
}: {
  handoverId: string;
  organizationId: string;
  party: CustodyHandoverParty;
  declaredName: string;
  signatureDataUrl: string;
  signedByUserId?: User["id"] | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const trimmedName = declaredName.trim();

  if (trimmedName.length < 2) {
    throw new ShelfError({
      cause: null,
      title: "Name required",
      message: "Please type your full name next to your signature.",
      additionalData: { handoverId, party },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const existing = await db.custodyHandover.findFirst({
    where: { id: handoverId, organizationId },
    include: { signatures: { select: { party: true } } },
  });

  if (!existing) {
    throw new ShelfError({
      cause: null,
      title: "Handover not found",
      message: "This handover record does not exist in your workspace.",
      additionalData: { handoverId, organizationId },
      label,
      status: 404,
      shouldBeCaptured: false,
    });
  }

  if (existing.state !== CustodyHandoverState.AWAITING_SIGNATURES) {
    throw new ShelfError({
      cause: null,
      title: "Handover already closed",
      message:
        existing.state === CustodyHandoverState.COMPLETED
          ? "This handover has already been completed and signed by both parties."
          : "This handover record was cancelled and can no longer be signed.",
      additionalData: { handoverId, state: existing.state },
      label,
      status: 409,
      shouldBeCaptured: false,
    });
  }

  if (existing.signatures.some((s) => s.party === party)) {
    throw new ShelfError({
      cause: null,
      title: "Already signed",
      message: "This party has already signed the handover.",
      additionalData: { handoverId, party },
      label,
      status: 409,
      shouldBeCaptured: false,
    });
  }

  const bytes = decodeSignatureDataUrl(signatureDataUrl);
  const imagePath = `${organizationId}/${handoverId}/${party.toLowerCase()}.png`;

  const { error: uploadError } = await getSupabaseAdmin()
    .storage.from(SIGNATURE_BUCKET)
    .upload(imagePath, bytes, { contentType: "image/png", upsert: true });

  if (uploadError) {
    throw new ShelfError({
      cause: uploadError,
      message:
        "The signature could not be stored. Please try again or contact support.",
      additionalData: { handoverId, party, imagePath },
      label: "File storage",
    });
  }

  try {
    return await db.$transaction(async (tx) => {
      await tx.custodyHandoverSignature.create({
        data: {
          handoverId,
          party,
          declaredName: trimmedName,
          signatureImagePath: imagePath,
          signedByUserId: signedByUserId ?? null,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });

      const signatureCount = await tx.custodyHandoverSignature.count({
        where: { handoverId },
      });

      // One signature down, one to go — nothing else happens yet.
      // `organizationId` is repeated in every `where` below even though the
      // record was already fetched and org-checked above: a compromised or
      // buggy caller that reached here with a foreign id must still miss.
      if (signatureCount < 2) {
        return tx.custodyHandover.findFirstOrThrow({
          where: { id: handoverId, organizationId },
          include: { signatures: true },
        });
      }

      const completed = await tx.custodyHandover.update({
        where: { id: handoverId, organizationId },
        data: {
          state: CustodyHandoverState.COMPLETED,
          completedAt: new Date(),
        },
        include: { signatures: true },
      });

      await applyHandoverEffect(completed, tx);

      return completed;
    });
  } catch (cause) {
    if (cause instanceof ShelfError) throw cause;

    // The unique index on (handoverId, party) is the last line of defence
    // against a double-submit that slipped past the read above.
    const isUniqueViolation =
      typeof cause === "object" &&
      cause !== null &&
      (cause as { code?: string }).code === "P2002";

    throw new ShelfError({
      cause,
      title: isUniqueViolation ? "Already signed" : undefined,
      message: isUniqueViolation
        ? "This party has already signed the handover."
        : "Something went wrong while saving the signature. Please try again or contact support.",
      additionalData: { handoverId, party },
      label,
      status: isUniqueViolation ? 409 : 500,
      shouldBeCaptured: !isUniqueViolation,
    });
  }
}

/**
 * Applies the custody change a completed handover authorises.
 *
 * Runs inside the same transaction that flipped the record to `COMPLETED`, so
 * the record and its effect commit together or not at all. Called only from
 * {@link recordHandoverSignature} — exported for tests, not for routes.
 *
 * @param handover - The record, already `COMPLETED`
 * @param tx - The open transaction client
 */
export async function applyHandoverEffect(
  handover: {
    id: string;
    kind: CustodyHandoverKind;
    assetId: string;
    organizationId: string;
    counterpartyTeamMemberId: string;
    operatorUserId: string | null;
  },
  tx: HandoverTxClient,
) {
  const isHandover = handover.kind === CustodyHandoverKind.HANDOVER;

  // Every `where` below carries `organizationId` alongside the id. The record
  // was org-checked before it reached here, but a write that trusts an id it
  // did not re-scope is one refactor away from being an IDOR.
  if (isHandover) {
    // deleteMany, not delete: clears any stale row so the partial unique index
    // cannot reject the insert below. Mirrors the pre-EPDA assign path.
    await tx.custody.deleteMany({ where: { assetId: handover.assetId } });
    await tx.asset.update({
      where: { id: handover.assetId, organizationId: handover.organizationId },
      data: {
        status: AssetStatus.IN_CUSTODY,
        custody: {
          create: {
            custodian: { connect: { id: handover.counterpartyTeamMemberId } },
          },
        },
      },
    });
  } else {
    await tx.asset.update({
      where: { id: handover.assetId, organizationId: handover.organizationId },
      data: {
        status: AssetStatus.AVAILABLE,
        custody: { deleteMany: {} },
      },
    });
  }

  const counterparty = await tx.teamMember.findFirst({
    where: {
      id: handover.counterpartyTeamMemberId,
      organizationId: handover.organizationId,
    },
    select: { id: true, name: true, user: { select: { id: true } } },
  });

  await recordEvent(
    {
      organizationId: handover.organizationId,
      actorUserId: handover.operatorUserId ?? undefined,
      action: isHandover ? "CUSTODY_ASSIGNED" : "CUSTODY_RELEASED",
      entityType: "ASSET",
      entityId: handover.assetId,
      assetId: handover.assetId,
      teamMemberId: handover.counterpartyTeamMemberId,
      targetUserId: counterparty?.user?.id ?? undefined,
    },
    tx,
  );
}

/**
 * Writes the asset-history note for a completed handover.
 *
 * Kept out of {@link applyHandoverEffect} on purpose: `createNote` runs its own
 * org-membership assertion against the default client and would deadlock
 * against the open transaction. The note is a record of something that already
 * happened, so a failure here must not roll the custody change back.
 *
 * @param handoverId - Completed record
 * @param organizationId - Caller's workspace
 * @param actorUserId - User whose name appears as the actor on the note
 */
export async function writeHandoverNote({
  handoverId,
  organizationId,
  actorUserId,
}: {
  handoverId: string;
  organizationId: string;
  actorUserId: User["id"];
}) {
  const handover = await db.custodyHandover.findFirst({
    where: { id: handoverId, organizationId },
    include: {
      counterparty: {
        select: {
          name: true,
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      operator: { select: { id: true, firstName: true, lastName: true } },
      signatures: { select: { party: true, declaredName: true } },
    },
  });

  if (!handover || handover.state !== CustodyHandoverState.COMPLETED) return;

  const actor = handover.operator
    ? wrapUserLinkForNote({
        id: handover.operator.id,
        firstName: handover.operator.firstName,
        lastName: handover.operator.lastName,
      })
    : "A workspace operator";

  const custodian = wrapCustodianForNote({
    teamMember: {
      name: handover.counterparty.name,
      user: handover.counterparty.user
        ? {
            id: handover.counterparty.user.id,
            firstName: handover.counterparty.user.firstName,
            lastName: handover.counterparty.user.lastName,
          }
        : null,
    },
  });

  const verb =
    handover.kind === CustodyHandoverKind.HANDOVER
      ? `handed the asset over to ${custodian}`
      : `took the asset back from ${custodian}`;

  await createNote({
    content: `${actor} ${verb}. Both parties signed handover record **${handover.reference}**.`,
    type: "UPDATE",
    userId: actorUserId,
    assetId: handover.assetId,
    organizationId,
  });
}

/**
 * Voids an open handover record.
 *
 * The record is kept rather than deleted, matching how rejected booking
 * requests are handled: an abandoned handover is itself information, and a
 * disappearing record is indistinguishable from one that never existed.
 *
 * @param handoverId - Record to abandon
 * @param organizationId - Caller's workspace
 * @param reason - Why it was abandoned. Required — this is the only account of
 *   why a half-signed محضر was dropped
 * @throws {ShelfError} 400 on an empty reason; 409 when the record is closed
 */
export async function voidHandover({
  handoverId,
  organizationId,
  reason,
}: {
  handoverId: string;
  organizationId: string;
  reason: string;
}) {
  const trimmed = reason.trim();

  if (!trimmed) {
    throw new ShelfError({
      cause: null,
      title: "Reason required",
      message: "Please say why this handover is being cancelled.",
      additionalData: { handoverId },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const updated = await db.custodyHandover.updateMany({
    where: {
      id: handoverId,
      organizationId,
      state: CustodyHandoverState.AWAITING_SIGNATURES,
    },
    data: {
      state: CustodyHandoverState.VOIDED,
      voidedAt: new Date(),
      voidedReason: trimmed,
    },
  });

  if (updated.count === 0) {
    throw new ShelfError({
      cause: null,
      title: "Handover already closed",
      message:
        "This handover is not awaiting signatures, so it cannot be cancelled.",
      additionalData: { handoverId },
      label,
      status: 409,
      shouldBeCaptured: false,
    });
  }
}

/**
 * Creates short-lived signed URLs for a record's signature images.
 *
 * Signature images are personal data and live in a private bucket, so they are
 * never linked directly. A URL that expires in minutes limits the blast radius
 * of a leaked page or a shoulder-surfed screen.
 *
 * @param signatures - Signature rows carrying `signatureImagePath`
 * @returns Map of party → signed URL. Parties whose URL could not be minted are
 *   omitted rather than throwing: a missing image must not blank the whole محضر
 */
export async function signatureImageUrls(
  signatures: { party: CustodyHandoverParty; signatureImagePath: string }[],
): Promise<Partial<Record<CustodyHandoverParty, string>>> {
  const entries = await Promise.all(
    signatures.map(async (signature) => {
      const { data } = await getSupabaseAdmin()
        .storage.from(SIGNATURE_BUCKET)
        .createSignedUrl(
          signature.signatureImagePath,
          SIGNATURE_URL_TTL_SECONDS,
        );

      return [signature.party, data?.signedUrl] as const;
    }),
  );

  return Object.fromEntries(
    entries.filter((entry): entry is readonly [CustodyHandoverParty, string] =>
      Boolean(entry[1]),
    ),
  );
}

/**
 * Counts records waiting on this user's signature, for the sidebar badge.
 *
 * Only counts the employee side. An operator's own pending desk-signatures are
 * not chased here — they are mid-flow in a modal they just left, not a task
 * someone else is blocked on.
 *
 * @param userId - Signed-in user
 * @param organizationId - Current workspace
 * @returns Number of records awaiting this user's signature
 */
export async function countHandoversAwaitingMySignature({
  userId,
  organizationId,
}: {
  userId: User["id"];
  organizationId: string;
}): Promise<number> {
  const member = await db.teamMember.findFirst({
    where: { organizationId, userId, deletedAt: null },
    select: { id: true },
  });

  if (!member) return 0;

  const open = await db.custodyHandover.findMany({
    where: {
      organizationId,
      counterpartyTeamMemberId: member.id,
      state: CustodyHandoverState.AWAITING_SIGNATURES,
    },
    select: { kind: true, signatures: { select: { party: true } } },
  });

  return open.filter((handover) => {
    const slot = partyFor(handover.kind, "counterparty");
    return !handover.signatures.some((s) => s.party === slot);
  }).length;
}

/**
 * Lists open handover records for the pending-signatures page.
 *
 * Serves two audiences from one query, which is why the scope is a parameter
 * and not a hardcoded filter:
 *
 * - An employee sees only records naming them — their own to-do list.
 * - An operator sees every open record in the workspace, because a handover
 *   the employee never signs is the operator's problem to chase, and an
 *   invisible stuck record is one nobody chases.
 *
 * @param userId - Signed-in user
 * @param organizationId - Current workspace
 * @param scopedToOwnRecords - Whether the viewer only sees their own records
 * @returns Open records, oldest first — the longest-waiting one is the most
 *   overdue, and burying it under newer entries is how it gets forgotten
 */
export async function listOpenHandovers({
  userId,
  organizationId,
  scopedToOwnRecords,
}: {
  userId: User["id"];
  organizationId: string;
  scopedToOwnRecords: boolean;
}) {
  const member = await db.teamMember.findFirst({
    where: { organizationId, userId, deletedAt: null },
    select: { id: true },
  });

  // An employee with no team-member row cannot be named on any record, so the
  // answer is empty rather than "everything".
  if (scopedToOwnRecords && !member) return [];

  return db.custodyHandover.findMany({
    where: {
      organizationId,
      state: CustodyHandoverState.AWAITING_SIGNATURES,
      ...(scopedToOwnRecords ? { counterpartyTeamMemberId: member!.id } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      asset: { select: { id: true, title: true, sequentialId: true } },
      counterparty: { select: { id: true, name: true } },
      operator: { select: { id: true, firstName: true, lastName: true } },
      signatures: {
        select: { party: true, declaredName: true, signedAt: true },
      },
    },
  });
}

/**
 * Fetches a handover record for display, scoped to the caller's workspace.
 *
 * @param handoverId - Record to load
 * @param organizationId - Caller's workspace
 * @returns The record with asset, counterparty, operator and signatures
 * @throws {ShelfError} 404 when it does not exist in this workspace
 */
export async function getHandover({
  handoverId,
  organizationId,
}: {
  handoverId: string;
  organizationId: string;
}) {
  const handover = await db.custodyHandover.findFirst({
    where: { id: handoverId, organizationId },
    include: {
      asset: {
        select: { id: true, title: true, sequentialId: true, mainImage: true },
      },
      counterparty: {
        select: {
          id: true,
          name: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
      operator: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      signatures: true,
    },
  });

  if (!handover) {
    throw new ShelfError({
      cause: null,
      title: "Handover not found",
      message: "This handover record does not exist in your workspace.",
      additionalData: { handoverId, organizationId },
      label,
      status: 404,
      shouldBeCaptured: false,
    });
  }

  return handover;
}
