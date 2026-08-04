/**
 * Request the return of an asset you hold (طلب استرجاع)
 *
 * Action-only resource route. Opens a `RETURN` handover record on the
 * custodian's own initiative and redirects them to the existing signing page,
 * where they put their signature on it. The warehouse then signs the other
 * half and custody is released.
 *
 * ## Why this is a separate route and not a button on the asset page
 *
 * The asset page's custody actions are gated on `asset.custody`, which `BASE`
 * employees do not hold — it governs managing *other people's* custody. This
 * route is gated on `asset.read` instead, and the real authorisation happens in
 * {@link openReturnRequest}: it checks whether the caller's team-member row
 * actually holds the asset. That is a fact about the person, not a role, and it
 * is checked against the `Custody` table rather than inferred from the UI they
 * came from.
 *
 * No signature is collected here. Opening the record and signing it are two
 * steps so the signing page — with its party-resolution guard — stays the only
 * place a signature is ever written.
 *
 * @see {@link file://./../_layout+/my-custody.tsx} — where the button lives
 * @see {@link file://./../_layout+/handovers_.$handoverId.tsx} — where it lands
 * @see {@link file://./../../modules/custody/handover.server.ts}
 */

import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { z } from "zod";
import { openReturnRequest } from "~/modules/custody/handover.server";
import { makeShelfError } from "~/utils/error";
import { error, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

/** Payload: which asset the caller wants to hand back, and why. */
const RequestReturnSchema = z.object({
  assetId: z.string().min(1),
  /**
   * Why it is coming back. Required — the warehouse triages this queue, and a
   * return with no stated reason forces them to chase the person to find out
   * what they are receiving.
   */
  requestReason: z
    .string()
    .trim()
    .min(3, "Please say why you are returning this asset"),
  /** Optional physical condition note, e.g. «الشاحن مفقود». */
  conditionNotes: z.string().max(2000).optional(),
});

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    const { assetId, requestReason, conditionNotes } = parseData(
      await request.formData(),
      RequestReturnSchema,
      { additionalData: { userId }, shouldBeCaptured: false },
    );

    const handover = await openReturnRequest({
      assetId,
      organizationId,
      userId,
      requestReason,
      conditionNotes,
    });

    // 303 so the browser follows up with a GET — a plain redirect from a POST
    // would replay the body against the signing page.
    return redirect(`/handovers/${handover.id}`, { status: 303 });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

/**
 * Resource routes still get a `loader` hit on direct navigation. Send anyone
 * who lands here by typing the URL back to their custody list rather than
 * returning an opaque 405.
 */
export function loader() {
  return redirect("/my-custody");
}
