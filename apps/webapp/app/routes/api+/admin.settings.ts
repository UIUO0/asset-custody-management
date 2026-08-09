/**
 * `/api/admin/settings` — instance-wide configuration.
 *
 * - `GET` returns every known setting with its effective value. Secrets come
 *   back as `••••••••`; their plaintext is never sent, to this endpoint's
 *   caller or anyone else.
 * - `PUT` applies a batch of updates.
 *
 * **App-wide admins only** (`Roles.ADMIN`, تقنية المعلومات). The gate is
 * `requireAdmin` on both methods rather than a `requirePermission` check,
 * because these settings are not organization-scoped — they decide how the
 * login screen behaves before any workspace context exists, so a workspace role
 * is the wrong thing to ask about.
 *
 * The admin UI at `/admin-dashboard/settings` posts to its own route action;
 * this endpoint exists for scripted configuration and for the deployment
 * pipeline.
 *
 * @see {@link file://./../../modules/app-settings/service.server.ts}
 * @see {@link file://./../_layout+/admin-dashboard+/settings.tsx} the UI
 */

import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import {
  getSettingsForAdmin,
  updateSettings,
} from "~/modules/app-settings/service.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { payload, error, parseJsonBody } from "~/utils/http.server";
import { requireAdmin } from "~/utils/roles.server";

/**
 * Batch update body.
 *
 * `value: null` clears a setting, which restores the environment fallback or the
 * registry default rather than storing an empty string — see
 * `updateSettings`. Keys are validated against the registry there; accepting a
 * plain string here keeps the failure message specific about *which* key was
 * unknown.
 */
const UpdateSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string().nullable(),
      }),
    )
    .min(1, "At least one setting is required"),
});

export async function loader({ context }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    await requireAdmin(userId);

    return data(payload({ settings: await getSettingsForAdmin() }));
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();

  try {
    await requireAdmin(userId);

    if (request.method !== "PUT" && request.method !== "PATCH") {
      throw new ShelfError({
        cause: null,
        message: "Use PUT to update settings.",
        label: "Settings",
        status: 405,
        shouldBeCaptured: false,
      });
    }

    const { settings } = await parseJsonBody(request, UpdateSettingsSchema);

    const updated = await updateSettings({ updates: settings, userId });

    // Return the fresh, redacted view so a scripted caller can confirm what
    // landed without a second round trip.
    return data(payload({ updated, settings: await getSettingsForAdmin() }));
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
