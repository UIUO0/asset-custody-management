/**
 * Booking request workflow (مسار الطلبات)
 *
 * A booking raised by an ordinary employee is a *request*: it exists in the
 * schedule but holds no inventory until المستودعات accept it. This module owns
 * the three transitions that move a request, and the rules that constrain them.
 *
 * The separation of powers is the point of the design:
 *
 * - **المستودعات** (`booking.approve`) accept or reject. They cannot place a
 *   review hold.
 * - **المخزون** (`booking.hold`) freeze a request for review and release their
 *   own freeze. They can never accept or reject one.
 *
 * A frozen request is frozen for everyone — accepting or rejecting while a hold
 * is in place is refused here, not merely hidden in the UI. Otherwise the hold
 * would be a suggestion rather than a control.
 *
 * Permission checks live in the routes; this module enforces the *data* rules
 * (state machine, mandatory reasons, org scoping) so every caller gets them.
 *
 * @see {@link file://./../../routes/_layout+/requests.tsx} the queue page
 * @see {@link file://./../../utils/permissions/permission.data.ts} `approve` / `hold`
 */

import { BookingApprovalState, type Booking, type User } from "@prisma/client";
import { db } from "~/database/db.server";
import { createBookingNote } from "~/modules/booking-note/service.server";
import { ShelfError, isLikeShelfError } from "~/utils/error";
import { wrapUserLinkForNote } from "~/utils/markdoc-wrappers";

const label = "Booking" as const;

/** Relations every request row needs to render a queue entry. */
export const BOOKING_REQUEST_INCLUDE = {
  creator: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
    },
  },
  custodianUser: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
    },
  },
  custodianTeamMember: { select: { id: true, name: true } },
  reviewHoldBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  approvalDecidedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  _count: { select: { bookingAssets: true } },
} as const;

/** A request row as returned by {@link getBookingRequests}. */
export type BookingRequest = Awaited<
  ReturnType<typeof getBookingRequests>
>["requests"][number];

/**
 * Loads the request queue for a workspace.
 *
 * Defaults to `PENDING` — the queue is "what still needs a decision", and that
 * is what both roles open the page for. Decided requests remain reachable by
 * passing an explicit state, so a rejection can be looked up afterwards.
 *
 * @param organizationId - Workspace to read (the only tenancy boundary here)
 * @param approvalState - Which bucket to return; defaults to the pending queue
 * @param page - 1-based page number
 * @param perPage - Rows per page (clamped to 1..100)
 * @returns The page of requests plus the total count for pagination
 * @throws {ShelfError} If the query fails
 */
export async function getBookingRequests({
  organizationId,
  approvalState = BookingApprovalState.PENDING,
  page = 1,
  perPage = 20,
}: {
  organizationId: Booking["organizationId"];
  approvalState?: BookingApprovalState;
  page?: number;
  perPage?: number;
}) {
  try {
    const take = Math.min(Math.max(perPage, 1), 100);
    const skip = page > 1 ? (page - 1) * take : 0;

    const where = { organizationId, approvalState };

    const [requests, totalRequests] = await Promise.all([
      db.booking.findMany({
        where,
        include: BOOKING_REQUEST_INCLUDE,
        /**
         * Held requests float to the top: they are the ones someone has
         * actively flagged, and leaving them buried under newer arrivals is
         * how a hold quietly becomes permanent. Oldest-first within each
         * group so nothing starves at the bottom of the queue.
         */
        orderBy: [
          { reviewHoldAt: { sort: "desc", nulls: "last" } },
          { createdAt: "asc" },
        ],
        skip,
        take,
      }),
      db.booking.count({ where }),
    ]);

    return { requests, totalRequests, page, perPage: take };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while fetching the requests.",
      additionalData: { organizationId, approvalState },
      label,
    });
  }
}

/**
 * Counts the pending requests in a workspace — for the sidebar badge.
 *
 * @param organizationId - Workspace to count within
 * @returns Number of requests awaiting a decision (0 on failure, never throws)
 */
export async function countPendingBookingRequests(
  organizationId: Booking["organizationId"],
): Promise<number> {
  try {
    return await db.booking.count({
      where: {
        organizationId,
        approvalState: BookingApprovalState.PENDING,
      },
    });
  } catch {
    // why: this only feeds a nav badge. A failed count must not take down the
    // whole layout loader that renders it.
    return 0;
  }
}

/**
 * Loads a request and asserts it is decidable, or throws.
 *
 * Shared by accept and reject so the two paths cannot drift apart on which
 * states they accept.
 */
async function requireDecidableRequest({
  id,
  organizationId,
}: {
  id: Booking["id"];
  organizationId: Booking["organizationId"];
}) {
  const request = await db.booking.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      name: true,
      approvalState: true,
      reviewHoldAt: true,
      reviewHoldReason: true,
    },
  });

  if (!request) {
    throw new ShelfError({
      cause: null,
      message: "Request not found",
      status: 404,
      additionalData: { id, organizationId },
      label,
    });
  }

  if (request.approvalState !== BookingApprovalState.PENDING) {
    throw new ShelfError({
      cause: null,
      title: "Already decided",
      message:
        "This request has already been decided. Reload the page to see its current state.",
      status: 400,
      additionalData: { id, approvalState: request.approvalState },
      label,
      shouldBeCaptured: false,
    });
  }

  /**
   * The hold is a control, not a hint. Enforced here rather than by disabling
   * the button, so a stale page or a hand-built request cannot slip past it.
   */
  if (request.reviewHoldAt) {
    throw new ShelfError({
      cause: null,
      title: "On hold for review",
      message:
        "This request is on hold for review and cannot be decided until the hold is released.",
      status: 409,
      additionalData: { id, reviewHoldReason: request.reviewHoldReason },
      label,
      shouldBeCaptured: false,
    });
  }

  return request;
}

/** Fetches the note-friendly identity of the acting user. */
async function getActorLink(userId: User["id"]) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, displayName: true, firstName: true, lastName: true },
  });
  return wrapUserLinkForNote(user);
}

/**
 * Accepts or rejects a pending booking request.
 *
 * Rejection requires a reason: the employee has to be able to see why their
 * request was turned down, and the note timeline is the only place that
 * survives. Acceptance takes an optional note.
 *
 * A rejected request is kept rather than deleted — the decision stays auditable
 * and the employee can still find it.
 *
 * @param id - Booking (request) id
 * @param organizationId - Owning workspace; scopes the update
 * @param userId - Deciding user, recorded on the booking and in the note
 * @param decision - `APPROVED` or `REJECTED`
 * @param note - Reason; mandatory when rejecting
 * @returns The updated booking
 * @throws {ShelfError} 404 unknown request, 400 already decided or missing
 *   rejection reason, 409 the request is on review hold
 */
export async function decideBookingRequest({
  id,
  organizationId,
  userId,
  decision,
  note,
}: {
  id: Booking["id"];
  organizationId: Booking["organizationId"];
  userId: User["id"];
  decision: Extract<
    BookingApprovalState,
    typeof BookingApprovalState.APPROVED | typeof BookingApprovalState.REJECTED
  >;
  note?: string | null;
}) {
  try {
    await requireDecidableRequest({ id, organizationId });

    const trimmedNote = note?.trim() || "";
    const isRejection = decision === BookingApprovalState.REJECTED;

    if (isRejection && !trimmedNote) {
      throw new ShelfError({
        cause: null,
        message: "A reason is required when rejecting a request.",
        status: 400,
        additionalData: { id },
        label,
        shouldBeCaptured: false,
      });
    }

    const updated = await db.booking.update({
      where: { id, organizationId },
      data: {
        approvalState: decision,
        approvalDecidedAt: new Date(),
        approvalDecidedById: userId,
        approvalNote: trimmedNote || null,
      },
    });

    const actor = await getActorLink(userId);

    await createBookingNote({
      content: isRejection
        ? `${actor} **rejected** this request. Reason: ${trimmedNote}`
        : `${actor} **accepted** this request.${
            trimmedNote ? ` Note: ${trimmedNote}` : ""
          }`,
      type: "UPDATE",
      userId,
      bookingId: id,
      organizationId,
    });

    return updated;
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: isLikeShelfError(cause)
        ? cause.message
        : "Something went wrong while deciding this request.",
      additionalData: { id, organizationId, decision },
      label,
      shouldBeCaptured: isLikeShelfError(cause) ? cause.shouldBeCaptured : true,
    });
  }
}

/**
 * Places or releases a review hold on a request (المخزون).
 *
 * A hold freezes the request: while it is in place nobody — including
 * المستودعات — can accept or reject it. Placing one requires a reason, because
 * a hold stops somebody else's request from moving and the reason is the only
 * record of why. Releasing takes an optional note.
 *
 * Only `PENDING` requests can be held: freezing an already-decided booking
 * would suggest a reversal the workflow does not support.
 *
 * @param id - Booking (request) id
 * @param organizationId - Owning workspace; scopes the update
 * @param userId - Acting user, recorded on the booking and in the note
 * @param hold - `true` to freeze, `false` to release
 * @param reason - Why; mandatory when placing a hold
 * @returns The updated booking
 * @throws {ShelfError} 404 unknown request, 400 already decided, already in the
 *   requested hold state, or a hold without a reason
 */
export async function setBookingReviewHold({
  id,
  organizationId,
  userId,
  hold,
  reason,
}: {
  id: Booking["id"];
  organizationId: Booking["organizationId"];
  userId: User["id"];
  hold: boolean;
  reason?: string | null;
}) {
  try {
    const request = await db.booking.findFirst({
      where: { id, organizationId },
      select: { id: true, approvalState: true, reviewHoldAt: true },
    });

    if (!request) {
      throw new ShelfError({
        cause: null,
        message: "Request not found",
        status: 404,
        additionalData: { id, organizationId },
        label,
      });
    }

    if (request.approvalState !== BookingApprovalState.PENDING) {
      throw new ShelfError({
        cause: null,
        title: "Already decided",
        message:
          "Only requests still awaiting a decision can be put on hold or released.",
        status: 400,
        additionalData: { id, approvalState: request.approvalState },
        label,
        shouldBeCaptured: false,
      });
    }

    if (Boolean(request.reviewHoldAt) === hold) {
      throw new ShelfError({
        cause: null,
        message: hold
          ? "This request is already on hold."
          : "This request is not on hold.",
        status: 400,
        additionalData: { id },
        label,
        shouldBeCaptured: false,
      });
    }

    const trimmedReason = reason?.trim() || "";

    if (hold && !trimmedReason) {
      throw new ShelfError({
        cause: null,
        message: "A reason is required when putting a request on hold.",
        status: 400,
        additionalData: { id },
        label,
        shouldBeCaptured: false,
      });
    }

    const updated = await db.booking.update({
      where: { id, organizationId },
      data: hold
        ? {
            reviewHoldAt: new Date(),
            reviewHoldById: userId,
            reviewHoldReason: trimmedReason,
          }
        : {
            // Clearing all three keeps "held" a single source of truth rather
            // than a timestamp with a stale reason hanging off it.
            reviewHoldAt: null,
            reviewHoldById: null,
            reviewHoldReason: null,
          },
    });

    const actor = await getActorLink(userId);

    await createBookingNote({
      content: hold
        ? `${actor} put this request **on hold for review**. Reason: ${trimmedReason}`
        : `${actor} **released the review hold** on this request.${
            trimmedReason ? ` Note: ${trimmedReason}` : ""
          }`,
      type: "UPDATE",
      userId,
      bookingId: id,
      organizationId,
    });

    return updated;
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: isLikeShelfError(cause)
        ? cause.message
        : "Something went wrong while updating the review hold.",
      additionalData: { id, organizationId, hold },
      label,
      shouldBeCaptured: isLikeShelfError(cause) ? cause.shouldBeCaptured : true,
    });
  }
}
