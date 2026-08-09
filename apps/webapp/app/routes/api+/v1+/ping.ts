/**
 * `GET /api/v1/ping` — credential check.
 *
 * Answers "is this key valid, and what may it do?" without touching business
 * data, so an integration can verify its configuration during setup and
 * monitoring can watch the credential without generating meaningful traffic.
 *
 * Gated on `assets:read` rather than being scope-free: an unscoped endpoint
 * would confirm a token is live to anyone holding it, which is exactly the
 * signal a probe is looking for.
 *
 * @see {@link file://./../../../modules/api-key/auth.server.ts}
 */

import { data, type LoaderFunctionArgs } from "react-router";
import { requireApiKey } from "~/modules/api-key/auth.server";
import { apiError } from "~/modules/external-api/response.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { organizationId, scopes } = await requireApiKey(
      request,
      "assets:read",
    );

    return data({
      data: {
        ok: true,
        organizationId,
        scopes,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (cause) {
    return apiError(cause);
  }
}
