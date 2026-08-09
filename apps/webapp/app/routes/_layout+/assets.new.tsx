/**
 * Legacy direct asset creation — superseded by the goods-receipt forms.
 *
 * EPDA books stock in on one of two official documents (مذكرة استلام /
 * محضر استلام), so this route no longer creates anything. It is kept as a
 * redirect rather than deleted because bookmarks, the command palette, the
 * QR-claim flow and stale open tabs still point here; a 404 would read as a
 * bug, while a redirect reads as "the door moved" — which is what happened.
 *
 * The `action` is guarded too, not just the `loader`. Redirecting the GET does
 * nothing about a POST replayed from a tab opened before this shipped, and that
 * POST would create an asset with no supplier, no purchase-order reference and
 * no value — exactly the record the paper forms exist to prevent.
 *
 * The previous implementation lives in git history at the commit that
 * introduced the receipt flow; restoring it is a `git show` away if intake is
 * ever scoped back down.
 *
 * @see {@link file://./receipts.new.tsx} the flow that replaces this
 * @see {@link file://./../../modules/goods-receipt/intake-guard.server.ts}
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { assertIntakeClosed } from "~/modules/goods-receipt/intake-guard.server";

// Not `async`: there is nothing to await in a redirect stub, and React Router
// accepts a synchronous loader/action just as happily.
export function loader(_args: LoaderFunctionArgs): never {
  assertIntakeClosed();
}

export function action(_args: ActionFunctionArgs): never {
  // 303 so the browser re-issues the follow-up as a GET rather than replaying
  // the POST body against the receipt form.
  assertIntakeClosed({ status: 303 });
}
