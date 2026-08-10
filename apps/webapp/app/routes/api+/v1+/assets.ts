/**
 * `/api/v1/assets` — the collection endpoint.
 *
 * - `GET` lists assets, filterable by search text, status, lifecycle stage and
 *   category. Requires `assets:read`.
 * - `POST` is closed — see {@link action}. Stock enters on a receipt form.
 *
 * The organization is taken from the API key and never from the request. There
 * is deliberately no `organizationId` parameter on this route: with one, a key
 * issued for workspace A could read workspace B by asking nicely.
 *
 * @see {@link file://./assets_.$assetId.ts} single-asset reads and updates
 * @see {@link file://./../../../modules/external-api/serializers.server.ts}
 */

import { AssetStatus, AssetLifecycleStage, type Prisma } from "@prisma/client";
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { db } from "~/database/db.server";
import { requireApiKey } from "~/modules/api-key/auth.server";
import {
  apiError,
  apiList,
  getApiPagination,
} from "~/modules/external-api/response.server";
import {
  API_ASSET_SELECT,
  serializeAsset,
} from "~/modules/external-api/serializers.server";
import { ShelfError } from "~/utils/error";

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

/**
 * Asset creation over the API is closed — stock enters on a receipt form.
 *
 * This was the last door left open after `/assets/new`, `/assets/import` and
 * asset duplication were closed. An API key with `assets:write` could mint rows
 * carrying no supplier, no purchase-order reference, no unit price and no
 * signatures — and because those rows have no `receiptLine`,
 * `assertReceiptSignedBeforeApproval` waves them through to `READY`. A control
 * that three UI paths respect and one machine path does not is not a control.
 *
 * `405`, and the message carries the permanence. `410 Gone` would say it more
 * precisely, but `ShelfError`'s status union is a deliberate allow-list and
 * widening it for one call site is the wrong trade. What matters is that an
 * integrator reading the response is told where the door moved rather than
 * being left to retry.
 *
 * Updating assets over the API is untouched — `PATCH /api/v1/assets/:id` is how
 * المالية push coding back, and it creates nothing.
 *
 * @see {@link file://./../../../modules/goods-receipt/intake-guard.server.ts}
 */
export function action({ request }: ActionFunctionArgs) {
  // Read nothing and touch no database: the answer is the same for every body,
  // and parsing one would suggest a shape that might still be accepted.
  void request;

  return apiError(
    new ShelfError({
      cause: null,
      title: "Asset creation is closed",
      message:
        "Assets can no longer be created through the API. Stock enters this system on a goods-receipt form (مذكرة/محضر استلام), which records the supplier, purchase order, unit price and the three signatures. Use PATCH /api/v1/assets/:id to update items that already exist.",
      label: "Assets",
      status: 405,
      shouldBeCaptured: false,
    }),
  );
}
