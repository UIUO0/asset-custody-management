/**
 * `GET /api/v1/locations` — locations in the key's workspace.
 *
 * Requires `locations:read`. Supports `?search=`, `?page=`, `?perPage=`.
 *
 * @see {@link file://./../../../modules/external-api/reference.server.ts}
 */

import { type LoaderFunctionArgs } from "react-router";
import { handleReferenceList } from "~/modules/external-api/reference.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return handleReferenceList({
    request,
    collection: "location",
    scope: "locations:read",
  });
}
