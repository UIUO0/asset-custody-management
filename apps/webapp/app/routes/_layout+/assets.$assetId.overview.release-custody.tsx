/**
 * Legacy unsigned custody release — superseded by the signed handover flow.
 *
 * The mirror of `assets.$assetId.overview.assign-custody.tsx`: EPDA requires a
 * signed محضر in *both* directions, so releasing an asset without the employee
 * and the warehouse both signing is no longer possible.
 *
 * Closing only the assign side would have been worse than closing neither — an
 * operator could release an asset unsigned and immediately re-assign it through
 * the signed flow, producing a handover record with no matching return and a
 * custody history that silently skips a step.
 *
 * The previous implementation lives in git history at the commit that
 * introduced this file.
 *
 * @see {@link file://./assets.$assetId.overview.custody-handover.tsx}
 * @see {@link file://./../../modules/custody/handover.server.ts}
 * @see {@link file://./../../../../docs/epda-custody-signatures.md}
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
