/**
 * `/api/admin/api-keys` — managing external-integration credentials.
 *
 * - `GET` lists every key across every workspace (tokens excluded — they are
 *   not stored).
 * - `POST` issues a key. The response is the **only** time the token is ever
 *   available; it is hashed before storage and cannot be recovered afterwards.
 * - `DELETE` revokes a key, soft-deleting it so the audit trail survives.
 *
 * **App-wide admins only** (`Roles.ADMIN`). A workspace owner cannot mint a
 * credential for their own workspace: an API key bypasses the interactive
 * session entirely, so issuing one is an instance-level act.
 *
 * @see {@link file://./../../modules/api-key/service.server.ts}
 * @see {@link file://./../_layout+/admin-dashboard+/integrations.tsx} the UI
 */

import {
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "~/modules/api-key/service.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { payload, error, parseJsonBody } from "~/utils/http.server";
import { requireAdmin } from "~/utils/roles.server";

const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  organizationId: z.string().min(1, "Workspace is required"),
  // Scope membership is validated in the service against API_KEY_SCOPES, so
  // the error names the offending scope rather than reporting a shape mismatch.
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
  /** ISO 8601. Omit for a key that never expires. */
  expiresAt: z.string().datetime().nullish(),
});

const RevokeApiKeySchema = z.object({
  id: z.string().min(1),
});

export async function loader({ context }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    await requireAdmin(userId);

    return data(payload({ apiKeys: await listApiKeys() }));
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();

  try {
    await requireAdmin(userId);

    switch (request.method) {
      case "POST": {
        const body = await parseJsonBody(request, CreateApiKeySchema);

        const created = await createApiKey({
          name: body.name,
          organizationId: body.organizationId,
          scopes: body.scopes,
          userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        });

        // `created.token` is present here and nowhere else, ever.
        return data(payload({ apiKey: created }), { status: 201 });
      }

      case "DELETE": {
        const { id } = await parseJsonBody(request, RevokeApiKeySchema);

        return data(payload({ apiKey: await revokeApiKey({ id }) }));
      }

      default:
        throw new ShelfError({
          cause: null,
          message: "Use POST to create or DELETE to revoke.",
          label: "API Key",
          status: 405,
          shouldBeCaptured: false,
        });
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}
