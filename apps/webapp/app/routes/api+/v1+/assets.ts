/**
 * `/api/v1/assets` — the collection endpoint.
 *
 * - `GET` lists assets, filterable by search text, status, lifecycle stage and
 *   category. Requires `assets:read`.
 * - `POST` creates an asset. Requires `assets:write`.
 *
 * The organization is taken from the API key and never from the request. There
 * is deliberately no `organizationId` parameter on this route: with one, a key
 * issued for workspace A could read workspace B by asking nicely.
 *
 * New assets are created at `lifecycleStage: PENDING`, the same as one added
 * through the UI. An integration that could inject assets straight into
 * `READY` would bypass المستودعات' approval step, which is the control the
 * intake workflow exists to provide.
 *
 * @see {@link file://./assets_.$assetId.ts} single-asset reads and updates
 * @see {@link file://./../../../modules/external-api/serializers.server.ts}
 */

import { AssetStatus, AssetLifecycleStage, type Prisma } from "@prisma/client";
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/database/db.server";
import { requireApiKey } from "~/modules/api-key/auth.server";
import { createAsset } from "~/modules/asset/service.server";
import {
  apiError,
  apiItem,
  apiList,
  getApiPagination,
} from "~/modules/external-api/response.server";
import {
  API_ASSET_SELECT,
  serializeAsset,
} from "~/modules/external-api/serializers.server";
import { ShelfError } from "~/utils/error";
import { parseJsonBody } from "~/utils/http.server";

const CreateAssetSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(1000).nullish(),
  categoryId: z.string().nullish(),
  locationId: z.string().nullish(),
  /** Monetary value. Rejected rather than coerced if not a number. */
  valuation: z.number().nullish(),
  availableToBook: z.boolean().optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  let apiKeyId: string | undefined;

  try {
    const context = await requireApiKey(request, "assets:read");
    apiKeyId = context.apiKeyId;

    const url = new URL(request.url);
    const pagination = getApiPagination(request);

    // Org scoping is applied here, at the top of the where-clause, so every
    // filter below can only ever narrow within the key's workspace.
    const where: Prisma.AssetWhereInput = {
      organizationId: context.organizationId,
    };

    const search = url.searchParams.get("search")?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { sequentialId: { contains: search, mode: "insensitive" } },
      ];
    }

    // Unknown enum values are ignored rather than rejected: a caller sending a
    // status this version does not know should get an unfiltered list, not a
    // failed sync.
    const status = url.searchParams.get("status");
    if (status && status in AssetStatus) {
      where.status = status as AssetStatus;
    }

    const lifecycleStage = url.searchParams.get("lifecycleStage");
    if (lifecycleStage && lifecycleStage in AssetLifecycleStage) {
      where.lifecycleStage = lifecycleStage as AssetLifecycleStage;
    }

    const categoryId = url.searchParams.get("categoryId");
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const [assets, total] = await Promise.all([
      db.asset.findMany({
        where,
        select: API_ASSET_SELECT,
        skip: pagination.skip,
        take: pagination.take,
        // Stable ordering matters more here than in the UI: an integration
        // paging through the collection must not see a record twice or miss one
        // because two rows share a timestamp.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      db.asset.count({ where }),
    ]);

    return apiList(assets.map(serializeAsset), pagination, total);
  } catch (cause) {
    return apiError(cause, apiKeyId);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  let apiKeyId: string | undefined;

  try {
    const context = await requireApiKey(request, "assets:write");
    apiKeyId = context.apiKeyId;

    if (request.method !== "POST") {
      throw new ShelfError({
        cause: null,
        message: "Use POST to create an asset.",
        label: "Assets",
        status: 405,
        shouldBeCaptured: false,
      });
    }

    const body = await parseJsonBody(request, CreateAssetSchema);

    // Referenced records must belong to the key's workspace. Prisma would
    // happily accept a foreign id and create a cross-organization link, so this
    // is checked before the write rather than trusted.
    if (body.categoryId) {
      await assertBelongsToOrg(
        "category",
        body.categoryId,
        context.organizationId,
      );
    }
    if (body.locationId) {
      await assertBelongsToOrg(
        "location",
        body.locationId,
        context.organizationId,
      );
    }

    const created = await createAsset({
      title: body.title,
      description: body.description ?? "",
      categoryId: body.categoryId ?? null,
      locationId: body.locationId ?? undefined,
      valuation: body.valuation ?? null,
      availableToBook: body.availableToBook ?? true,
      organizationId: context.organizationId,
      // Attributed to the admin who issued the key — see ApiKeyContext.
      userId: context.actingUserId,
    });

    // Re-read for the response shape. Still org-scoped even though we just
    // created the row in this organization — an id-only lookup here would be
    // one refactor away from being reachable with a caller-supplied id.
    const asset = await db.asset.findFirstOrThrow({
      where: { id: created.id, organizationId: context.organizationId },
      select: API_ASSET_SELECT,
    });

    return apiItem(serializeAsset(asset), 201);
  } catch (cause) {
    return apiError(cause, apiKeyId);
  }
}

/**
 * Confirms a referenced record lives in the caller's workspace.
 *
 * @param model - Which reference collection to check
 * @param id - The referenced id
 * @param organizationId - The API key's workspace
 * @throws {ShelfError} 400 when the id does not exist in this workspace. The
 *   message says "not found in this workspace" rather than distinguishing
 *   "missing" from "belongs to someone else", so the endpoint cannot be used to
 *   probe for ids in other organizations.
 */
async function assertBelongsToOrg(
  model: "category" | "location",
  id: string,
  organizationId: string,
): Promise<void> {
  const found =
    model === "category"
      ? await db.category.findFirst({
          where: { id, organizationId },
          select: { id: true },
        })
      : await db.location.findFirst({
          where: { id, organizationId },
          select: { id: true },
        });

  if (!found) {
    throw new ShelfError({
      cause: null,
      message: `The referenced ${model} was not found in this workspace.`,
      additionalData: { model, id },
      label: "Assets",
      status: 400,
      shouldBeCaptured: false,
    });
  }
}
