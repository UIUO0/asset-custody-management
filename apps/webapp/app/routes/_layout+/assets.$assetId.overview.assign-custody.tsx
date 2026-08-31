/**
 * Legacy unsigned custody assignment — superseded by the signed handover flow.
 *
 * ORG requires both parties to sign before an asset changes hands, so this
 * route no longer assigns anything. It is kept as a redirect rather than
 * deleted because bookmarks, the mobile app and stale open tabs still point
 * here; a 404 would read as a bug, while a redirect lands the operator on the
 * flow that actually produces the محضر.
 *
 * The `action` is guarded too, not just the `loader`. Redirecting the GET does
 * nothing about a POST replayed from a tab that was opened before this shipped,
 * and that POST would otherwise move custody with no signatures attached —
 * exactly the hole the feature exists to close.
 *
 * The previous implementation lives in git history at the commit that
 * introduced this file; restoring it is a `git show` away if the signature
 * requirement is ever scoped down.
 *
 * @see {@link file://./assets.$assetId.overview.custody-handover.tsx}
 * @see {@link file://./../../modules/custody/handover.server.ts}
 * @see {@link file://./../../../../docs/org-custody-signatures.md}
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { z } from "zod";
import { getParams } from "~/utils/http.server";

/** Path of the signed flow that replaces this route. */
function signedHandoverPath(assetId: string) {
  return `/assets/${assetId}/overview/custody-handover`;
}

// Not `async`: there is nothing to await in a redirect stub, and React Router
// accepts a synchronous loader/action just as happily.
export function loader({ context, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  const { assetId } = getParams(params, z.object({ assetId: z.string() }), {
    additionalData: { userId },
  });

  return redirect(signedHandoverPath(assetId));
}

export function action({ context, params }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  const { assetId } = getParams(params, z.object({ assetId: z.string() }), {
    additionalData: { userId },
  });

  // 303 so the browser re-issues the follow-up as a GET rather than replaying
  // the POST body against the handover route.
  return redirect(signedHandoverPath(assetId), { status: 303 });
}
