/**
 * `GET /api/v1/categories` — categories in the key's workspace.
 *
 * Requires `categories:read`. Supports `?search=`, `?page=`, `?perPage=`.
 *
 * @see {@link file://./../../../modules/external-api/reference.server.ts}
 */

import { type LoaderFunctionArgs } from "react-router";
import { handleReferenceList } from "~/modules/external-api/reference.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return handleReferenceList({
    request,
    collection: "category",
    scope: "categories:read",
  });
}
