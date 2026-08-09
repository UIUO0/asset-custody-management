/**
 * `GET /api/v1/team-members` — people in the key's workspace.
 *
 * Requires `team:read`. Covers both registered users and non-registered
 * members (NRM), since custody can be held by either and an integration
 * reconciling holders needs to see both.
 *
 * Soft-deleted members are excluded. `TeamMember` uses `deletedAt` rather than
 * hard deletion so historical custody records keep a name attached — those rows
 * are history, not current staff, and must not appear in a directory sync.
 *
 * Only name, email and workspace role are exposed; see the serializer for what
 * is deliberately withheld.
 *
 * @see {@link file://./../../../modules/external-api/serializers.server.ts}
 */

import { type LoaderFunctionArgs } from "react-router";
import { db } from "~/database/db.server";
import { requireApiKey } from "~/modules/api-key/auth.server";
import {
  apiError,
  apiList,
  getApiPagination,
} from "~/modules/external-api/response.server";
import { serializeTeamMember } from "~/modules/external-api/serializers.server";

export async function loader({ request }: LoaderFunctionArgs) {
  let apiKeyId: string | undefined;

  try {
    const context = await requireApiKey(request, "team:read");
    apiKeyId = context.apiKeyId;

    const pagination = getApiPagination(request);
    const search = new URL(request.url).searchParams.get("search")?.trim();

    const where = {
      organizationId: context.organizationId,
      deletedAt: null,
      ...(search
        ? { name: { contains: search, mode: "insensitive" as const } }
        : {}),
    };

    const [members, total] = await Promise.all([
      db.teamMember.findMany({
        where,
        select: {
          id: true,
          name: true,
          createdAt: true,
          user: {
            select: {
              email: true,
              // Scoped to this workspace: a user who belongs to several
              // organizations must not have their role elsewhere reported here.
              userOrganizations: {
                where: { organizationId: context.organizationId },
                select: { roles: true },
                take: 1,
              },
            },
          },
        },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      db.teamMember.count({ where }),
    ]);

    return apiList(members.map(serializeTeamMember), pagination, total);
  } catch (cause) {
    return apiError(cause, apiKeyId);
  }
}
