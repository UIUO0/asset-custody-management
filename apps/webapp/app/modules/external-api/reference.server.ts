/**
 * The shared list handler behind `/api/v1/locations` and `/categories`.
 *
 * All three answer the same question — "what reference records exist in this
 * workspace?" — and differ only in which table they read. Written as three
 * route handlers they were three copies of the same org scoping, the same
 * pagination, and the same search clause, which is three places for one of them
 * to drift out of step on the scoping in particular.
 *
 * @see {@link file://./serializers.server.ts} the shared output shape
 */

import type { Prisma } from "@prisma/client";
import { db } from "~/database/db.server";
import { apiError, apiList, getApiPagination } from "./response.server";
import { serializeNamedRecord } from "./serializers.server";
import { requireApiKey } from "../api-key/auth.server";
import type { ApiKeyScope } from "../api-key/scopes";

/** Which reference collection a route is serving. */
export type ReferenceCollection = "location" | "category";

/** Columns the shared serializer needs. Identical across the three tables. */
const REFERENCE_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Authenticates, queries and serializes one reference collection.
 *
 * Supports `?search=` (case-insensitive, on name) plus the standard `page` /
 * `perPage`. Results are ordered by name so a caller diffing two syncs sees a
 * stable list rather than creation-order churn.
 *
 * @param args.request - The incoming request
 * @param args.collection - Which table to read
 * @param args.scope - The scope the caller must hold
 * @returns A `data()` response — either the list envelope or the error envelope
 */
export async function handleReferenceList({
  request,
  collection,
  scope,
}: {
  request: Request;
  collection: ReferenceCollection;
  scope: ApiKeyScope;
}) {
  let apiKeyId: string | undefined;

  try {
    const context = await requireApiKey(request, scope);
    apiKeyId = context.apiKeyId;

    const pagination = getApiPagination(request);
    const search = new URL(request.url).searchParams.get("search")?.trim();

    // The three tables share these two columns, so one where-clause shape
    // serves all of them. `organizationId` is set from the key, never the
    // request.
    const where = {
      organizationId: context.organizationId,
      ...(search
        ? { name: { contains: search, mode: "insensitive" as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      findMany(collection, where, pagination.skip, pagination.take),
      count(collection, where),
    ]);

    return apiList(items.map(serializeNamedRecord), pagination, total);
  } catch (cause) {
    return apiError(cause, apiKeyId);
  }
}

/** Dispatches the read to the right Prisma delegate. */
function findMany(
  collection: ReferenceCollection,
  where: Prisma.LocationWhereInput & Prisma.CategoryWhereInput,
  skip: number,
  take: number,
) {
  const args = {
    where,
    select: REFERENCE_SELECT,
    skip,
    take,
    orderBy: [{ name: "asc" as const }, { id: "asc" as const }],
  };

  switch (collection) {
    case "location":
      return db.location.findMany(args);
    case "category":
      return db.category.findMany(args);
  }
}

/** Dispatches the count to the right Prisma delegate. */
function count(
  collection: ReferenceCollection,
  where: Prisma.LocationWhereInput & Prisma.CategoryWhereInput,
) {
  switch (collection) {
    case "location":
      return db.location.count({ where });
    case "category":
      return db.category.count({ where });
  }
}
