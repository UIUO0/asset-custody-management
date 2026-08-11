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
  TeamMember,
  User,
  CustodyHandoverParty,
} from "@prisma/client";
import {
  AssetStatus,
  AssetType,
  CustodyHandoverKind,
  CustodyHandoverState,
} from "@prisma/client";
import { db } from "~/database/db.server";
import { getSupabaseAdmin } from "~/integrations/supabase/client";
import { recordEvent } from "~/modules/activity-event/service.server";
// `partyFor` lives in a neutral module because route *components* render from
// it — importing it from here would drag this whole server module into the
// client bundle. See the docblock in `./handover.ts`.
import { resolveSignableParty } from "~/modules/custody/handover";
import { createNote } from "~/modules/note/service.server";
import { ShelfError } from "~/utils/error";
import {
  wrapCustodianForNote,
  wrapUserLinkForNote,
} from "~/utils/markdoc-wrappers";
import { resolveDepartmentDeskId } from "~/utils/permissions/role-scope";

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
 * Opens a handover record covering one or more assets, in `AWAITING_SIGNATURES`.
 *
 * Validates that **every** asset is in a state where the requested direction
 * makes sense — you cannot open a تسليم for an asset already in someone's
 * custody, nor an استرجاع for one nobody holds. Any earlier record still
 * awaiting signatures for any of the same assets is voided, so an abandoned
 * attempt cannot be completed later by whoever still has the tab open.
 *
 * ## Why a list
 *
 * The warehouse hands a whole purchase order to a department in one go, and the
 * paper that gets signed is ONE document listing every line. A single-asset
 * handover is just a one-element list — there is no separate code path, so the
 * batch case cannot drift from the single case.
 *
 * ## All-or-nothing
 *
 * One bad asset rejects the whole batch rather than silently handing over the
 * rest. A محضر that lists fewer assets than the operator selected is a document
 * that disagrees with what physically moved, and nobody would notice until an
 * audit. The error names the offending asset so the operator can fix it.
 *
 * @param assets - Lines changing hands, `{ id, quantity? }`. Must be non-empty.
 *   `quantity` defaults to 1 and is validated against the units actually
 *   available (or, on a transfer, the units the releasing side holds).
 * @param organizationId - Caller's workspace
 * @param kind - `HANDOVER` (تسليم) or `RETURN` (استرجاع)
 * @param counterpartyTeamMemberId - The employee or department side of the
 *   transaction
 * @param operatorUserId - Warehouse operator opening the record, or `null` when
 *   the custodian opened it themselves (see {@link openReturnRequest})
 * @param conditionNotes - Optional condition baseline printed on the محضر
 * @returns The created record, with its `reference` and asset lines
 * @throws {ShelfError} 400 on an empty list; 404 when an asset is not in the
 *   workspace; 409 when an asset's custody state contradicts the direction
 */
export async function openHandover({
  assets: requestedLines,
  organizationId,
  kind,
  counterpartyTeamMemberId,
  releasingTeamMemberId = null,
  operatorUserId,
  conditionNotes,
}: {
  /**
   * The lines this محضر covers. `quantity` defaults to 1 and is only
   * meaningful for `QUANTITY_TRACKED` assets — see
   * `CustodyHandoverAsset.quantity`.
   */
  assets: Array<{ id: Asset["id"]; quantity?: number }>;
  organizationId: string;
  kind: CustodyHandoverKind;
  counterpartyTeamMemberId: TeamMember["id"];
  /**
   * Who is giving the asset up on a `HANDOVER`.
   *
   * `null` (the default) means the warehouse shelf — the asset must be held by
   * nobody. Set it to a team member to record a **transfer**: إدارة المرافق
   * passing a laptop it received in a batch on to one of its own staff.
   *
   * Without this, a department could only move stock by returning it to the
   * warehouse first, producing two محاضر for one physical movement and an
   * audit trail that says the asset went back to the shelf when it never left
   * the building.
   *
   * It is a *tightening*, not a loosening: when set, every asset must be held
   * by exactly this member, so a caller cannot use it to hand over stock that
   * somebody else is holding.
   */
  releasingTeamMemberId?: TeamMember["id"] | null;
  operatorUserId: User["id"] | null;
  conditionNotes?: string | null;
}) {
  /**
   * De-duplicate up front: the same asset twice would trip the pivot's unique
   * index mid-transaction with a Prisma error nobody can act on. Repeated ids
   * SUM rather than overwrite — two lines of 10 pens is a request for 20, and
   * silently keeping the last one would hand over half of what was asked.
   */
  const quantityByAssetId = new Map<string, number>();
  for (const line of requestedLines) {
    quantityByAssetId.set(
      line.id,
      (quantityByAssetId.get(line.id) ?? 0) + Math.trunc(line.quantity ?? 1),
    );
  }
  const uniqueAssetIds = [...quantityByAssetId.keys()];

  if (uniqueAssetIds.length === 0) {
    throw new ShelfError({
      cause: null,
      title: "No assets selected",
      message: "A handover record must cover at least one asset.",
      additionalData: { organizationId, kind },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  try {
    return await db.$transaction(async (tx) => {
      const assets = await tx.asset.findMany({
        where: { id: { in: uniqueAssetIds }, organizationId },
        select: {
          id: true,
          title: true,
          type: true,
          quantity: true,
          custody: { select: { id: true, teamMemberId: true, quantity: true } },
        },
      });

      if (assets.length !== uniqueAssetIds.length) {
        const found = new Set(assets.map((a) => a.id));
        const missing = uniqueAssetIds.filter((id) => !found.has(id));
        throw new ShelfError({
          cause: null,
          title: "Asset not found",
          message:
            missing.length === uniqueAssetIds.length
              ? "This asset does not exist in your workspace."
              : `${missing.length} of the selected assets do not exist in your workspace.`,
          additionalData: { missing, organizationId },
          label,
          status: 404,
          shouldBeCaptured: false,
        });
      }

      for (const asset of assets) {
        const heldBy = asset.custody[0]?.teamMemberId ?? null;
        const isQtyTracked = asset.type === AssetType.QUANTITY_TRACKED;
        const requested = quantityByAssetId.get(asset.id) ?? 1;

        if (requested < 1) {
          throw new ShelfError({
            cause: null,
            title: "Invalid quantity",
            message: `The quantity for "${asset.title}" must be at least 1.`,
            additionalData: { assetId: asset.id, requested },
            label,
            status: 400,
            shouldBeCaptured: false,
          });
        }

        /**
         * An individually-tracked asset is one physical thing. Accepting a
         * larger number would print a محضر claiming three of a laptop that
         * exists once.
         */
        if (!isQtyTracked && requested !== 1) {
          throw new ShelfError({
            cause: null,
            title: "Invalid quantity",
            message: `"${asset.title}" is tracked individually, so only one unit can change hands.`,
            additionalData: { assetId: asset.id, requested },
            label,
            status: 400,
            shouldBeCaptured: false,
          });
        }

        /** Units this asset already has out, across every custodian. */
        const heldTotal = asset.custody.reduce(
          (sum, row) => sum + (row.quantity ?? 0),
          0,
        );

        if (kind === CustodyHandoverKind.HANDOVER) {
          if (releasingTeamMemberId) {
            // Transfer: the named holder must actually be holding it. Both
            // failures below are the same class of mistake — a محضر that says
            // someone released an asset they never had.
            if (!heldBy) {
              throw new ShelfError({
                cause: null,
                title: "Asset is not in custody",
                message: `"${asset.title}" is not in anyone's custody, so it cannot be transferred.`,
                additionalData: { assetId: asset.id, releasingTeamMemberId },
                label,
                status: 409,
                shouldBeCaptured: false,
              });
            }

            if (heldBy !== releasingTeamMemberId) {
              throw new ShelfError({
                cause: null,
                title: "Wrong custodian",
                message: `"${asset.title}" is in a different custodian's hands, so it is not yours to pass on.`,
                additionalData: {
                  assetId: asset.id,
                  heldBy,
                  releasingTeamMemberId,
                },
                label,
                status: 409,
                shouldBeCaptured: false,
              });
            }

            // Nobody hands an asset to its current holder: the محضر would
            // record a movement that did not happen, and both signature slots
            // would belong to the same side.
            if (releasingTeamMemberId === counterpartyTeamMemberId) {
              throw new ShelfError({
                cause: null,
                title: "Same custodian",
                message:
                  "The receiving side must be different from the side giving the asset up.",
                additionalData: { releasingTeamMemberId },
                label,
                status: 400,
                shouldBeCaptured: false,
              });
            }

            // A transfer can only pass on what the releasing side actually
            // holds — إدارة المرافق with 30 pens cannot hand an employee 40.
            const releasable =
              asset.custody.find(
                (row) => row.teamMemberId === releasingTeamMemberId,
              )?.quantity ?? 0;

            if (requested > releasable) {
              throw new ShelfError({
                cause: null,
                title: "Not enough units",
                message: `Cannot hand over ${requested} of "${
                  asset.title
                }" — only ${releasable} ${
                  releasable === 1 ? "unit is" : "units are"
                } in your custody.`,
                additionalData: { assetId: asset.id, requested, releasable },
                label,
                status: 409,
                shouldBeCaptured: false,
              });
            }
          } else if (isQtyTracked) {
            /**
             * Quantity-tracked stock hands out in parts, so "already in
             * custody" is not a yes/no question — it is arithmetic. An asset
             * with 30 pens and 10 already out still has 20 on the shelf.
             */
            const available = (asset.quantity ?? 0) - heldTotal;

            if (requested > available) {
              throw new ShelfError({
                cause: null,
                title: "Not enough units",
                message: `Cannot hand over ${requested} of "${
                  asset.title
                }" — only ${available} of ${asset.quantity ?? 0} ${
                  available === 1 ? "unit is" : "units are"
                } available (${heldTotal} already in custody).`,
                additionalData: {
                  assetId: asset.id,
                  requested,
                  available,
                  heldTotal,
                },
                label,
                status: 409,
                shouldBeCaptured: false,
              });
            }
          } else if (heldBy) {
            throw new ShelfError({
              cause: null,
              title: "Asset already in custody",
              message: `"${asset.title}" is already in someone's custody. It has to be returned before it can be handed over again.`,
              additionalData: { assetId: asset.id, heldBy },
              label,
              status: 409,
              shouldBeCaptured: false,
            });
          }
        }

        if (kind === CustodyHandoverKind.RETURN) {
          if (!heldBy) {
            throw new ShelfError({
              cause: null,
              title: "Asset is not in custody",
              message: `Nobody currently holds "${asset.title}", so there is nothing to return.`,
              additionalData: { assetId: asset.id },
              label,
              status: 409,
              shouldBeCaptured: false,
            });
          }

          const held =
            asset.custody.find(
              (row) => row.teamMemberId === counterpartyTeamMemberId,
            )?.quantity ?? 0;

          if (held > 0 && requested > held) {
            throw new ShelfError({
              cause: null,
              title: "Not enough units",
              message: `Cannot return ${requested} of "${
                asset.title
              }" — only ${held} ${
                held === 1 ? "unit is" : "units are"
              } in that custody.`,
              additionalData: { assetId: asset.id, requested, held },
              label,
              status: 409,
              shouldBeCaptured: false,
            });
          }

          if (heldBy !== counterpartyTeamMemberId) {
            throw new ShelfError({
              cause: null,
              title: "Wrong custodian",
              message: `"${asset.title}" is in a different team member's custody. Return records must name the person actually holding it.`,
              additionalData: {
                assetId: asset.id,
                heldBy,
                counterpartyTeamMemberId,
              },
              label,
              status: 409,
              shouldBeCaptured: false,
            });
          }
        }
      }

      // Abandon any earlier open attempt touching any of these assets. Without
      // this, an operator who closed the modal halfway leaves a signable record
      // behind that could later complete against a different physical handover.
      await tx.custodyHandover.updateMany({
        where: {
          organizationId,
          state: CustodyHandoverState.AWAITING_SIGNATURES,
          assets: { some: { assetId: { in: uniqueAssetIds } } },
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
              organizationId,
              counterpartyTeamMemberId,
              releasingTeamMemberId,
              operatorUserId,
              conditionNotes: conditionNotes?.trim() || null,
              assets: {
                create: uniqueAssetIds.map((assetId) => ({
                  assetId,
                  quantity: quantityByAssetId.get(assetId) ?? 1,
                })),
              },
            },
            include: { signatures: true, assets: true },
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
        additionalData: { assetIds: uniqueAssetIds, organizationId },
        label,
      });
    });
  } catch (cause) {
    if (cause instanceof ShelfError) throw cause;
    throw new ShelfError({
      cause,
      message:
        "Something went wrong while opening the handover record. Please try again or contact support.",
      additionalData: { assetIds: uniqueAssetIds, organizationId, kind },
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
      organizationId,
      kind: CustodyHandoverKind.RETURN,
      state: CustodyHandoverState.AWAITING_SIGNATURES,
      assets: { some: { assetId } },
    },
    include: { signatures: true, assets: true },
  });

  if (alreadyOpen) return alreadyOpen;

  const opened = await openHandover({
    assets: [{ id: assetId }],
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
        // `assets` carries the per-line quantities the effect moves, and
        // `releasingTeamMemberId` tells it whether to decrement a custodian or
        // take the units off the shelf. A batch محضر applies in full or not at all.
        include: {
          signatures: true,
          assets: { select: { assetId: true, quantity: true } },
        },
      });

      // The stock this محضر was opened against may have moved since. Checked
      // here, immediately before the effect, inside the same transaction — see
      // {@link assertHandoverStillApplicable}.
      await assertHandoverStillApplicable(completed, tx);

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
 * Re-checks, at signing time, that the stock the محضر was opened against is
 * still there.
 *
 * ## Why the checks in `openHandover` are not enough
 *
 * The effect lands on the **second signature**, which may be days after the
 * first — that delay is the whole point of remote signing. `openHandover` voids
 * any competing handover on the same assets, so a second محضر cannot appear in
 * the gap. But every *other* custody path is still open in it:
 * `releaseCustody` wipes an asset's custody rows, and the quantity-custody
 * dialog issues units straight off the shelf. Neither knows an unsigned محضر is
 * waiting on that stock.
 *
 * Without this re-check the effect applies regardless, and the arithmetic
 * silently stops adding up:
 *
 * - **Off the shelf.** 30 pens, a محضر open for all 30, and 30 issued
 *   elsewhere in the meantime. Signing writes another custody row for 30 — 60
 *   units of an asset that has 30.
 * - **A transfer.** The releasing side's row is gone by signing time, so
 *   {@link applyHandoverEffect} finds nothing to decrement and skips it, while
 *   still crediting the receiving side. Units appear from nowhere.
 * - **An individual asset.** Its single custody row belongs to somebody else by
 *   now, and the partial unique index is on `(assetId, teamMemberId)` — a
 *   *different* holder is a different pair, so the database allows two people to
 *   hold one laptop.
 *
 * Throwing rolls the whole transaction back, signature included: a محضر whose
 * stock has moved must not be completed on the strength of what was true when
 * it was opened. The operator re-opens it against the real position, which is
 * the document that should have been signed.
 *
 * The rules mirror `openHandover` deliberately — the same arithmetic at both
 * ends, so a محضر that could be opened can be signed unless the world changed.
 *
 * @param handover - The record being completed, with its asset lines
 * @param tx - The open transaction client
 * @throws {ShelfError} 409 naming the asset and the shortfall
 */
export async function assertHandoverStillApplicable(
  handover: {
    kind: CustodyHandoverKind;
    assets: { assetId: string; quantity?: number }[];
    organizationId: string;
    counterpartyTeamMemberId: string;
    releasingTeamMemberId?: string | null;
  },
  tx: HandoverTxClient,
): Promise<void> {
  const assetIds = handover.assets.map((line) => line.assetId);
  if (assetIds.length === 0) return;

  const releasingTeamMemberId = handover.releasingTeamMemberId ?? null;

  const assets = await tx.asset.findMany({
    where: { id: { in: assetIds }, organizationId: handover.organizationId },
    select: {
      id: true,
      title: true,
      type: true,
      quantity: true,
      custody: { select: { teamMemberId: true, quantity: true } },
    },
  });

  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  /** The same 409 for every shortfall — one shape the UI can present. */
  const stale = (message: string, additionalData: Record<string, unknown>) =>
    new ShelfError({
      cause: null,
      title: "Stock has moved",
      message,
      additionalData: {
        ...additionalData,
        organizationId: handover.organizationId,
      },
      label,
      status: 409,
      shouldBeCaptured: false,
    });

  for (const line of handover.assets) {
    const asset = byId.get(line.assetId);

    if (!asset) {
      // Deleted between opening and signing. Nothing to move, and a محضر that
      // names a row nobody can look up is not a document worth completing.
      throw stale(
        "One of the assets on this record no longer exists in your workspace. Open a new record for the assets that are still there.",
        { assetId: line.assetId },
      );
    }

    const moved = Math.max(1, line.quantity ?? 1);
    const isQtyTracked = asset.type === AssetType.QUANTITY_TRACKED;
    const heldTotal = asset.custody.reduce(
      (sum, row) => sum + (row.quantity ?? 0),
      0,
    );

    if (handover.kind === CustodyHandoverKind.HANDOVER) {
      if (releasingTeamMemberId) {
        const releasable =
          asset.custody.find(
            (row) => row.teamMemberId === releasingTeamMemberId,
          )?.quantity ?? 0;

        if (moved > releasable) {
          throw stale(
            `"${asset.title}" has moved since this record was opened — the releasing side now holds ${releasable} of the ${moved} it lists. Open a new record for what they actually hold.`,
            { assetId: asset.id, moved, releasable, releasingTeamMemberId },
          );
        }

        continue;
      }

      if (isQtyTracked) {
        const available = (asset.quantity ?? 0) - heldTotal;

        if (moved > available) {
          throw stale(
            `"${
              asset.title
            }" has moved since this record was opened — only ${available} of ${
              asset.quantity ?? 0
            } units are still on the shelf, and this record hands over ${moved}.`,
            { assetId: asset.id, moved, available, heldTotal },
          );
        }

        continue;
      }

      if (heldTotal > 0 || asset.custody.length > 0) {
        throw stale(
          `"${asset.title}" was given to somebody else after this record was opened. It has to be returned before it can be handed over again.`,
          { assetId: asset.id, heldBy: asset.custody[0]?.teamMemberId ?? null },
        );
      }

      continue;
    }

    /**
     * A return only ever *reduces* custody, so it cannot inflate stock and the
     * check is correspondingly narrow: the counterparty must still hold at
     * least what the محضر says they are giving back. Holding nothing at all is
     * left to {@link applyHandoverEffect}, which no-ops — somebody else having
     * released it already is a duplicate, not a discrepancy.
     */
    const held =
      asset.custody.find(
        (row) => row.teamMemberId === handover.counterpartyTeamMemberId,
      )?.quantity ?? 0;

    if (held > 0 && moved > held) {
      throw stale(
        `"${asset.title}" has moved since this record was opened — ${held} units are in that custody and this record returns ${moved}.`,
        { assetId: asset.id, moved, held },
      );
    }
  }
}

/**
 * Applies the custody change a completed handover authorises.
 *
 * Runs inside the same transaction that flipped the record to `COMPLETED`, so
 * the record and its effect commit together or not at all. Called only from
 * {@link recordHandoverSignature} — exported for tests, not for routes.
 *
 * The stock is re-checked first by {@link assertHandoverStillApplicable}; this
 * function assumes that guard has passed and does not re-derive it.
 *
 * @param handover - The record, already `COMPLETED`
 * @param tx - The open transaction client
 */
export async function applyHandoverEffect(
  handover: {
    id: string;
    kind: CustodyHandoverKind;
    assets: { assetId: string; quantity?: number }[];
    organizationId: string;
    counterpartyTeamMemberId: string;
    /**
     * Who gave the units up on a transfer, so their custody can be decremented
     * rather than wiped. `null`/absent means they came off the warehouse shelf.
     */
    releasingTeamMemberId?: string | null;
    operatorUserId: string | null;
  },
  tx: HandoverTxClient,
) {
  const isHandover = handover.kind === CustodyHandoverKind.HANDOVER;
  const releasingTeamMemberId = handover.releasingTeamMemberId ?? null;

  const counterparty = await tx.teamMember.findFirst({
    where: {
      id: handover.counterpartyTeamMemberId,
      organizationId: handover.organizationId,
    },
    select: { id: true, name: true, user: { select: { id: true } } },
  });

  // Sequential, not `Promise.all`: these are writes inside one transaction, and
  // a batch of a hundred lines fired at once exhausts the connection's
  // statement pipeline before it exhausts the transaction.
  for (const { assetId, quantity } of handover.assets) {
    /**
     * Units this line moves. Individually-tracked assets are one physical
     * thing, so their lines are always 1 (enforced in {@link openHandover});
     * quantity-tracked lines carry the count the two parties signed for.
     */
    const moved = Math.max(1, quantity ?? 1);

    // Every `where` below carries `organizationId` alongside the id. The record
    // was org-checked before it reached here, but a write that trusts an id it
    // did not re-scope is one refactor away from being an IDOR.
    if (isHandover) {
      /**
       * Decrement the releasing side rather than wiping every custody row.
       *
       * A department passing 10 of its 30 pens to an employee must keep 20 —
       * `deleteMany` here would silently return the other 20 to the shelf, and
       * the only trace would be a stock count that stopped adding up.
       *
       * Absent `releasingTeamMemberId` the units come off the shelf, so there
       * is nothing to decrement.
       */
      if (releasingTeamMemberId) {
        const releasing = await tx.custody.findFirst({
          where: { assetId, teamMemberId: releasingTeamMemberId },
          select: { id: true, quantity: true },
        });

        if (releasing) {
          const left = (releasing.quantity ?? 0) - moved;
          if (left > 0) {
            await tx.custody.update({
              where: { id: releasing.id },
              data: { quantity: left },
            });
          } else {
            // Handed on everything they held — the row itself goes.
            await tx.custody.delete({ where: { id: releasing.id } });
          }
        }
      }

      /**
       * Add to the receiving side, or create their row.
       *
       * `increment` rather than replace: an employee who already holds 5 pens
       * and signs for 10 more holds 15, not 10. The partial unique index makes
       * the find + create/update sequence safe inside this transaction —
       * mirrors `assignQuantityCustody`.
       */
      const receiving = await tx.custody.findFirst({
        where: {
          assetId,
          teamMemberId: handover.counterpartyTeamMemberId,
        },
        select: { id: true },
      });

      if (receiving) {
        await tx.custody.update({
          where: { id: receiving.id },
          data: { quantity: { increment: moved } },
        });
      } else {
        await tx.custody.create({
          data: {
            assetId,
            teamMemberId: handover.counterpartyTeamMemberId,
            quantity: moved,
          },
        });
      }

      await tx.asset.update({
        where: { id: assetId, organizationId: handover.organizationId },
        data: { status: AssetStatus.IN_CUSTODY },
      });
    } else {
      /**
       * A return takes back only what the محضر lists. The custodian may still
       * hold the rest, and the asset only becomes `AVAILABLE` once nobody
       * holds any of it — a status flip while units are still out is exactly
       * what lets a second handover over-allocate the stock.
       */
      const held = await tx.custody.findFirst({
        where: { assetId, teamMemberId: handover.counterpartyTeamMemberId },
        select: { id: true, quantity: true },
      });

      if (held) {
        const left = (held.quantity ?? 0) - moved;
        if (left > 0) {
          await tx.custody.update({
            where: { id: held.id },
            data: { quantity: left },
          });
        } else {
          await tx.custody.delete({ where: { id: held.id } });
        }
      }

      const stillOut = await tx.custody.count({ where: { assetId } });

      await tx.asset.update({
        where: { id: assetId, organizationId: handover.organizationId },
        data: {
          status: stillOut > 0 ? AssetStatus.IN_CUSTODY : AssetStatus.AVAILABLE,
        },
      });
    }

    // One event per asset, not one per محضر: the asset's own activity timeline
    // is where people look, and a batch event filed against the first line
    // would leave the other ninety-nine looking like they moved by themselves.
    await recordEvent(
      {
        organizationId: handover.organizationId,
        actorUserId: handover.operatorUserId ?? undefined,
        action: isHandover ? "CUSTODY_ASSIGNED" : "CUSTODY_RELEASED",
        entityType: "ASSET",
        entityId: assetId,
        assetId,
        teamMemberId: handover.counterpartyTeamMemberId,
        targetUserId: counterparty?.user?.id ?? undefined,
      },
      tx,
    );
  }
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
      assets: { select: { assetId: true } },
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

  // One note per asset. A batch محضر moved every line, and a note written only
  // against the first would leave the rest of the assets with an unexplained
  // custody change in their history — which is the one place anyone looks when
  // asking "how did this end up with them?".
  //
  // Sequential rather than `Promise.all`: `createNote` runs its own
  // org-membership assertion per call, and firing a hundred of those at once
  // is a self-inflicted connection storm for something nobody is waiting on.
  for (const { assetId } of handover.assets) {
    await createNote({
      content: `${actor} ${verb}. Both parties signed handover record **${handover.reference}**.`,
      type: "UPDATE",
      userId: actorUserId,
      assetId,
      organizationId,
    });
  }
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
 * Counts two different things, because a user can be blocking a handover in two
 * different capacities:
 *
 * 1. **As the named employee** — a محضر someone opened naming them.
 * 2. **As the warehouse desk**, when they hold `asset.custody` — a محضر an
 *    employee opened and signed, now waiting on the desk to receive the asset.
 *
 * The second case was missing in the first cut, and the omission was not
 * cosmetic: an employee-initiated return would sit signed and invisible,
 * because operators only met it if they happened to open `/handovers`. The
 * queue existed; nothing pointed at it. A workflow whose next step nobody is
 * told about is a workflow that stops.
 *
 * @param userId - Signed-in user
 * @param organizationId - Current workspace
 * @param canOperate - Whether the viewer holds `asset.custody`, i.e. may sign
 *   as the warehouse side. Passed in rather than re-derived so the caller's
 *   permission check stays the single source of truth
 * @returns Number of records this user is currently blocking
 */
export async function countHandoversAwaitingMySignature({
  userId,
  organizationId,
  canOperate,
}: {
  userId: User["id"];
  organizationId: string;
  canOperate: boolean;
}): Promise<number> {
  const [member, ownDepartmentTeamMemberId] = await Promise.all([
    db.teamMember.findFirst({
      where: { organizationId, userId, deletedAt: null },
      select: { id: true },
    }),
    // A batch محضر names the department desk, not the person signing for it.
    resolveOwnDepartmentId({ userId, organizationId }),
  ]);

  // Nothing to count for a user who is neither a possible counterparty nor an
  // operator — and no query worth running for them either.
  if (!member && !ownDepartmentTeamMemberId && !canOperate) return 0;

  // Both rows they could be named as: their own, and their department's.
  const ownCounterpartyIds = [member?.id, ownDepartmentTeamMemberId].filter(
    (id): id is string => Boolean(id),
  );

  const open = await db.custodyHandover.findMany({
    where: {
      organizationId,
      state: CustodyHandoverState.AWAITING_SIGNATURES,
      ...(canOperate
        ? {}
        : { counterpartyTeamMemberId: { in: ownCounterpartyIds } }),
    },
    select: {
      kind: true,
      counterpartyTeamMemberId: true,
      signatures: { select: { party: true } },
    },
  });

  return open.filter((handover) =>
    Boolean(
      resolveSignableParty({
        // `state` is `AWAITING_SIGNATURES` by the query above; restating it
        // keeps the shared guard the only place that decides.
        handover: {
          ...handover,
          state: CustodyHandoverState.AWAITING_SIGNATURES,
        },
        canOperate,
        ownTeamMemberId: member?.id ?? null,
        ownDepartmentTeamMemberId,
      }),
    ),
  ).length;
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
  const [member, ownDepartmentTeamMemberId] = await Promise.all([
    db.teamMember.findFirst({
      where: { organizationId, userId, deletedAt: null },
      select: { id: true },
    }),
    // A department officer is named on batch محاضر through their desk's row,
    // never their personal one — see `resolveOwnDepartmentId`.
    resolveOwnDepartmentId({ userId, organizationId }),
  ]);

  const ownCounterpartyIds = [member?.id, ownDepartmentTeamMemberId].filter(
    (id): id is string => Boolean(id),
  );

  // Somebody who can be named on no record at all sees nothing, rather than
  // everything — `[]` here must never collapse into an unfiltered query.
  if (scopedToOwnRecords && ownCounterpartyIds.length === 0) return [];

  return db.custodyHandover.findMany({
    where: {
      organizationId,
      state: CustodyHandoverState.AWAITING_SIGNATURES,
      ...(scopedToOwnRecords
        ? { counterpartyTeamMemberId: { in: ownCounterpartyIds } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      assets: {
        select: {
          asset: { select: { id: true, title: true, sequentialId: true } },
        },
      },
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
      assets: {
        select: {
          quantity: true,
          asset: {
            select: {
              id: true,
              title: true,
              sequentialId: true,
              mainImage: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
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

/**
 * The department desk this user speaks for, or `null`.
 *
 * Read from the user's own membership rather than from anything the client
 * sends: this is what proves an operator is acting *for* إدارة المرافق rather
 * than merely claiming to be. It is the single input that turns a return into
 * a department-to-employee transfer, so it must never be forgeable.
 *
 * Returns `null` for everyone who is not a department user, which is exactly
 * what the caller wants — no department, no transfer, ordinary rules apply.
 *
 * @param userId - The signed-in user
 * @param organizationId - Caller's workspace
 * @returns The department's `TeamMember` id, or `null`
 */
export async function resolveOwnDepartmentId({
  userId,
  organizationId,
}: {
  userId: User["id"];
  organizationId: string;
}): Promise<string | null> {
  const membership = await db.userOrganization.findFirst({
    where: { userId, organizationId },
    select: { roles: true, departmentTeamMemberId: true },
  });

  if (!membership) return null;

  // The rule itself lives in `role-scope.ts`; this function only supplies the
  // membership it needs. Two copies of "role AND pointer" would eventually
  // disagree.
  return resolveDepartmentDeskId({
    roles: membership.roles,
    departmentTeamMemberId: membership.departmentTeamMemberId,
  });
}
