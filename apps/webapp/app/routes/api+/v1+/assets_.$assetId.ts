/**
 * `/api/v1/assets/:assetId` — a single asset.
 *
 * The filename's trailing underscore (`assets_.`) opts this route out of
 * nesting under `assets.ts`. Without it, flat-routes would make the collection
 * route this one's parent — and a resource route whose parent also has a
 * loader is a question about framework internals that an external API contract
 * should not depend on the answer to.
 *
 * - `GET` returns it. Requires `assets:read`.
 * - `PATCH` updates the fields an integration is allowed to own. Requires
 *   `assets:write`.
 *
 * The lookup is scoped to the key's organization in the `where` clause rather
 * than fetched-then-checked. A cross-organization id therefore reads as "not
 * found", which is both the correct answer and the one that reveals nothing
 * about what exists elsewhere.
 *
 * `lifecycleStage` is not writable here. Moving an asset from `PENDING` to
 * `READY` is المستودعات' approval decision and goes through
 * `asset.approve`; an integration with `assets:write` must not be able to
 * perform it as a side effect of editing a title.
 *
 * @see {@link file://./assets.ts} the collection endpoint
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/database/db.server";
import { requireApiKey } from "~/modules/api-key/auth.server";
import { updateAsset } from "~/modules/asset/service.server";
import { apiError, apiItem } from "~/modules/external-api/response.server";
import {
  API_ASSET_SELECT,
  serializeAsset,
} from "~/modules/external-api/serializers.server";
import { ShelfError } from "~/utils/error";
import { parseJsonBody } from "~/utils/http.server";

/**
 * Every field is optional — this is a PATCH. Omitting a key leaves it alone;
 * sending `null` clears it where the column is nullable.
 */
const UpdateAssetSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(1000).nullish(),
    /** Send `"uncategorized"` to clear the category — the service's convention. */
    categoryId: z.string().nullish(),
    valuation: z.number().nullish(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

export async function loader({ request, params }: LoaderFunctionArgs) {
  let apiKeyId: string | undefined;

  try {
    const context = await requireApiKey(request, "assets:read");
    apiKeyId = context.apiKeyId;

    const asset = await db.asset.findFirst({
      where: { id: params.assetId, organizationId: context.organizationId },
      select: API_ASSET_SELECT,
    });

    if (!asset) {
      throw notFound();
    }

    return apiItem(serializeAsset(asset));
  } catch (cause) {
    return apiError(cause, apiKeyId);
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  let apiKeyId: string | undefined;

  try {
    const context = await requireApiKey(request, "assets:write");
    apiKeyId = context.apiKeyId;

    if (request.method !== "PATCH" && request.method !== "PUT") {
      throw new ShelfError({
        cause: null,
        message: "Use PATCH to update an asset.",
        label: "Assets",
        status: 405,
        shouldBeCaptured: false,
      });
    }

    // Existence and ownership are established before the update, so a
    // cross-organization id can never reach `updateAsset`.
    const existing = await db.asset.findFirst({
      where: { id: params.assetId, organizationId: context.organizationId },
      select: { id: true },
    });

    if (!existing) {
      throw notFound();
    }

    const body = await parseJsonBody(request, UpdateAssetSchema);

    if (body.categoryId && body.categoryId !== "uncategorized") {
      const category = await db.category.findFirst({
        where: { id: body.categoryId, organizationId: context.organizationId },
        select: { id: true },
      });

      if (!category) {
        throw new ShelfError({
          cause: null,
          message: "The referenced category was not found in this workspace.",
          label: "Assets",
          status: 400,
          shouldBeCaptured: false,
        });
      }
    }

    await updateAsset({
      id: existing.id,
      // `undefined` for an omitted key means "leave unchanged" all the way
      // through updateAsset, so a PATCH never blanks a field it did not mention.
      title: body.title,
      description: body.description ?? undefined,
      categoryId: body.categoryId ?? undefined,
      valuation: body.valuation ?? undefined,
      organizationId: context.organizationId,
      userId: context.actingUserId,
      request,
    });

    // Re-read for the response shape, org-scoped like every other query here.
    const asset = await db.asset.findFirstOrThrow({
      where: { id: existing.id, organizationId: context.organizationId },
      select: API_ASSET_SELECT,
    });

    return apiItem(serializeAsset(asset));
  } catch (cause) {
    return apiError(cause, apiKeyId);
  }
}

/** The one 404 this route can produce — same message for missing and foreign. */
function notFound() {
  return new ShelfError({
    cause: null,
    message: "Asset not found.",
    label: "Assets",
    status: 404,
    shouldBeCaptured: false,
  });
}
