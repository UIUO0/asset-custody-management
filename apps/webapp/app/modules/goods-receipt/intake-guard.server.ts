/**
 * The guard that makes the receipt forms the only way stock enters.
 *
 * `/assets/new` and `/assets/import` still exist as modules — they are reached
 * by bookmarks, by the command palette, by the QR-claim flow and by stale open
 * tabs — but they no longer admit anything. Calling {@link assertIntakeClosed}
 * at the top of their loader and action turns each into a redirect.
 *
 * ## Why a redirect and not a 404
 *
 * The routes were the normal way to add stock until this shipped. A 404 reads
 * as a broken system; a redirect to `/receipts/new` reads as "the door moved",
 * which is what actually happened.
 *
 * ## Why the guard is in the action too
 *
 * Redirecting the `loader` closes the page. It does nothing about a `POST`
 * replayed from a tab that was opened before this shipped, and that POST would
 * otherwise create an asset with no supplier, no purchase-order reference and
 * no value — exactly the record the paper forms exist to prevent. Same posture
 * as the legacy custody routes.
 *
 * ## The QR-claim flow
 *
 * Scanning an unlinked QR sticker used to offer "create a new asset here".
 * That was a second door, so it is gone: the flow now only links a sticker to
 * an item that already exists, which is the correct order of operations
 * anyway — the delivery is booked in on a form, then someone walks around
 * putting stickers on what arrived.
 *
 * @see {@link file://./service.server.ts} the flow that replaces both routes
 * @see {@link file://./../../routes/_layout+/receipts.new.tsx} the form
 */

import { redirect } from "react-router";

/** Where a closed intake route sends the operator. */
export const RECEIPT_INTAKE_PATH = "/receipts/new";

/**
 * Ends the request by redirecting to the receipt forms.
 *
 * Throws rather than returns so a caller cannot accidentally continue past it:
 * `assertIntakeClosed()` on its own line is enough, and forgetting to `return`
 * it cannot silently reopen the door.
 *
 * @param options.status - 303 for a POST, so the browser re-issues the
 *   follow-up as a GET instead of replaying the body at the receipt form.
 *   Defaults to 302 for a loader.
 * @throws {Response} Always — a redirect
 */
export function assertIntakeClosed(options?: { status?: 302 | 303 }): never {
  throw redirect(RECEIPT_INTAKE_PATH, { status: options?.status ?? 302 });
}
