/**
 * Shared response shape and pagination for the external API (`/api/v1/*`).
 *
 * The webapp's own endpoints answer to its React client and use the `payload` /
 * `error` envelope from `utils/http.server`. The external API answers to
 * third-party systems that will be written against it once and then left alone
 * for years, so it gets its own deliberately boring contract:
 *
 * ```jsonc
 * // success
 * { "data": [...], "meta": { "page": 1, "perPage": 50, "total": 137, "totalPages": 3 } }
 * // failure
 * { "error": { "message": "...", "status": 403 } }
 * ```
 *
 * Keeping it separate means a change made for the sake of the webapp's UI can
 * never silently alter what an integration receives.
 *
 * @see {@link file://./../api-key/auth.server.ts} authentication
 */

import { data } from "react-router";
import {
  isLikeShelfError,
  makeShelfError,
  type ShelfError,
} from "~/utils/error";

/** Page size ceiling. Protects the database from an unbounded `perPage`. */
export const MAX_PER_PAGE = 200;

/** Page size when the caller does not ask for one. */
export const DEFAULT_PER_PAGE = 50;

export type ApiPagination = {
  page: number;
  perPage: number;
  skip: number;
  take: number;
};

/**
 * Reads `?page` and `?perPage`, clamped to a safe range.
 *
 * Invalid input is coerced rather than rejected — an integration that sends
 * `page=0` or `perPage=abc` should get the first page, not a 400 that stops a
 * nightly sync.
 *
 * @param request - The incoming request
 * @returns Normalized paging plus the Prisma `skip`/`take`
 */
export function getApiPagination(request: Request): ApiPagination {
  const url = new URL(request.url);

  const rawPage = Number(url.searchParams.get("page"));
  const rawPerPage = Number(url.searchParams.get("perPage"));

  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const perPage =
    Number.isFinite(rawPerPage) && rawPerPage >= 1
      ? Math.min(Math.floor(rawPerPage), MAX_PER_PAGE)
      : DEFAULT_PER_PAGE;

  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

/**
 * Success envelope for a list endpoint.
 *
 * @param items - The page of records
 * @param pagination - What {@link getApiPagination} returned
 * @param total - Total matching records, for `totalPages`
 */
export function apiList<T>(
  items: T[],
  pagination: ApiPagination,
  total: number,
) {
  return data({
    data: items,
    meta: {
      page: pagination.page,
      perPage: pagination.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.perPage)),
    },
  });
}

/**
 * Success envelope for a single record.
 *
 * @param item - The record
 * @param status - HTTP status; 201 for a creation
 */
export function apiItem<T>(item: T, status: 200 | 201 = 200) {
  return data({ data: item }, { status });
}

/**
 * Failure envelope.
 *
 * Deliberately does not reuse `utils/http.server`'s `error()`: that helper
 * emits a user-facing notification through the SSE emitter, which is meaningful
 * for a browser session and nonsense for a machine caller.
 *
 * `additionalData` is never included — it can carry internal identifiers and
 * query shapes that an external system has no business seeing. The detail stays
 * in the server logs via `makeShelfError`.
 *
 * @param cause - The thrown value
 * @param apiKeyId - Included in the log context, not in the response
 */
export function apiError(cause: unknown, apiKeyId?: string) {
  const reason: ShelfError = makeShelfError(
    cause,
    { apiKeyId },
    isLikeShelfError(cause) ? cause.shouldBeCaptured : true,
  );

  return data(
    {
      error: {
        message: reason.message,
        status: reason.status,
        traceId: reason.traceId,
      },
    },
    { status: reason.status },
  );
}
