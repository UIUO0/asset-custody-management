/**
 * Tests for the legacy unsigned custody-assignment route.
 *
 * This route used to assign custody directly. EPDA requires both parties to
 * sign a محضر before an asset changes hands, so it was reduced to a redirect
 * onto the signed handover flow — see the docblock on the route itself.
 *
 * What is worth testing therefore changed completely. The old suite pinned
 * cross-org validation and note-writing, none of which this route performs any
 * more; those guarantees moved to `handover.server.ts` and are covered by its
 * own tests. What matters *here* is the property the redirect exists to
 * provide:
 *
 *   **A POST replayed against this URL must not move custody.**
 *
 * A tab opened before the signed flow shipped still holds a form pointing at
 * this action. If that POST ever fell through to an assignment, an asset would
 * change hands with no signatures attached — precisely the hole the handover
 * feature closes. Guarding the loader alone would not catch it, which is why
 * the action is asserted separately below.
 *
 * @see {@link file://../../app/routes/_layout+/assets.$assetId.overview.assign-custody.tsx}
 * @see {@link file://../../app/modules/custody/handover.server.ts}
 * @see {@link file://../../../docs/epda-custody-signatures.md}
 */

import { createActionArgs, createLoaderArgs } from "@mocks/remix";

import {
  action,
  loader,
} from "~/routes/_layout+/assets.$assetId.overview.assign-custody";

// @vitest-environment node

const ASSET_ID = "asset-123";
const SIGNED_FLOW_PATH = `/assets/${ASSET_ID}/overview/custody-handover`;

/** Args carrying the asset id the route reads out of the URL params. */
function argsFor(overrides: Parameters<typeof createActionArgs>[0] = {}) {
  return { params: { assetId: ASSET_ID }, ...overrides };
}

describe("assets.$assetId.overview.assign-custody", () => {
  describe("loader", () => {
    it("redirects a bookmarked GET onto the signed handover flow", () => {
      const response = loader(
        createLoaderArgs(argsFor()) as Parameters<typeof loader>[0],
      ) as Response;

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(SIGNED_FLOW_PATH);
    });
  });

  describe("action", () => {
    it("refuses to assign custody and redirects the POST instead", async () => {
      const formData = new FormData();
      formData.set(
        "custodian",
        JSON.stringify({ id: "team-123", name: "Team Member" }),
      );

      const response = action(
        createActionArgs(
          argsFor({
            request: new Request(
              `https://example.com/assets/${ASSET_ID}/overview/assign-custody`,
              { method: "POST", body: formData },
            ),
          }),
        ) as Parameters<typeof action>[0],
      ) as Response;

      expect(response.headers.get("Location")).toBe(SIGNED_FLOW_PATH);
    });

    it("answers 303 so the browser does not replay the POST body", () => {
      /**
       * The status code is the substance of this test, not a detail. A 302 on a
       * POST leaves the method to browser discretion, and a client that repeats
       * the POST would deliver an unsigned custody payload to the handover
       * route. 303 forces the follow-up to be a GET.
       */
      const response = action(
        createActionArgs(
          argsFor({
            request: new Request(
              `https://example.com/assets/${ASSET_ID}/overview/assign-custody`,
              { method: "POST", body: new FormData() },
            ),
          }),
        ) as Parameters<typeof action>[0],
      ) as Response;

      expect(response.status).toBe(303);
    });
  });
});
