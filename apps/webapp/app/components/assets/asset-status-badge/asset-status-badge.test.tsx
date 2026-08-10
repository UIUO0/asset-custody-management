/**
 * AssetStatusBadge — unit tests
 *
 * This file used to be almost entirely about `suppressQtyAware`, the escape
 * hatch booking rows passed to stop the badge relabelling them from the global
 * quantity breakdown. Bookings are gone, the prop is gone, and so are those
 * cases — they asserted the behaviour of a caller that no longer exists.
 *
 * What is worth pinning now is narrower and outlives the booking removal:
 *
 *  - A quantity-tracked asset with units in custody relabels to the qty-aware
 *    wording rather than showing its bare status.
 *  - The lazy `/api/assets/:id/quantity-breakdown` fetch stays disabled until
 *    the cursor enters the badge — an index renders a hundred of these, and
 *    fetching on mount would fan out a hundred requests.
 *  - The fetch is skipped entirely when the caller already supplied the data
 *    inline, and for INDIVIDUAL assets, which have no breakdown to fetch.
 *  - A `PENDING` asset shows its lifecycle stage, not its status.
 *
 * @see {@link file://./asset-status-badge.tsx}
 */

import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { AssetStatusBadge } from "./asset-status-badge";
import type { QuantityAwareAsset } from "./quantity-data";

/**
 * Captures calls into the `useApiQuery` hook so each test can assert whether
 * the qty-breakdown endpoint was queried, and with `enabled` true or false.
 * The hook returns `{ data: undefined }` so the badge renders its pre-fetch
 * state.
 */
const apiQueryCalls: Array<{ api: string; enabled: boolean }> = [];

// why: the badge resolves its label through i18next. These assertions use the
// English wording, and every `status.*` key falls back to the shared
// `@shelf/labels` string, so returning the fallback reproduces the runtime
// wording without booting an i18n instance in JSDOM.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

// why: the hook performs a real fetch. Mocking it keeps the test off the
// network and lets the assertions below introspect the call shape.
vi.mock("~/hooks/use-api-query", () => ({
  default: ({ api, enabled }: { api: string; enabled?: boolean }) => {
    apiQueryCalls.push({ api, enabled: !!enabled });
    return { data: undefined, isLoading: false, error: undefined };
  },
}));

// why: Radix HoverCard relies on `ResizeObserver` and portal pointer-events
// plumbing that happy-dom doesn't fully simulate. Only the trigger text needs
// to reach the DOM, so passthrough renderers are enough.
vi.mock("../../shared/hover-card", () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@radix-ui/react-hover-card", () => ({
  HoverCardPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  apiQueryCalls.length = 0;
});

/** A quantity-tracked asset with some of its units held. */
function qtAssetPartlyHeld(): QuantityAwareAsset {
  return {
    type: "QUANTITY_TRACKED",
    quantity: 10,
    custody: [{ quantity: 4 }],
    assetKits: null,
  };
}

/** A quantity-tracked asset with nothing held and no inline slices. */
function qtAssetWithoutData(): QuantityAwareAsset {
  return {
    type: "QUANTITY_TRACKED",
    quantity: 10,
    custody: null,
    assetKits: null,
  };
}

describe("AssetStatusBadge", () => {
  it("relabels a partly-held quantity-tracked asset", () => {
    // The point of the qty-aware branch: "Available" is wrong for an asset
    // with four of ten units out, and the persisted status cannot say so.
    render(
      <AssetStatusBadge
        id="asset-1"
        status="AVAILABLE"
        asset={qtAssetPartlyHeld()}
      />,
    );

    expect(screen.getByText("Partial custody")).toBeTruthy();
  });

  it("falls back to the plain status while the breakdown is unknown", () => {
    render(
      <AssetStatusBadge
        id="asset-1"
        status="AVAILABLE"
        asset={qtAssetWithoutData()}
      />,
    );

    expect(screen.getByText("Available")).toBeTruthy();
  });

  it("does not fetch the breakdown until the cursor enters", () => {
    // An asset index renders a hundred of these. Fetching on mount would fan
    // out a hundred requests for tooltips nobody opened.
    const { container } = render(
      <AssetStatusBadge
        id="asset-1"
        status="AVAILABLE"
        asset={qtAssetWithoutData()}
      />,
    );

    const breakdownCall = apiQueryCalls.find((call) =>
      call.api.includes("quantity-breakdown"),
    );
    expect(breakdownCall?.enabled).toBe(false);

    const badge = container.querySelector("span");
    expect(badge).toBeTruthy();
    fireEvent.mouseEnter(badge as Element);

    const afterHover = apiQueryCalls.filter((call) =>
      call.api.includes("quantity-breakdown"),
    );
    expect(afterHover.some((call) => call.enabled)).toBe(true);
  });

  it("never fetches for an asset whose slices came inline", () => {
    render(
      <AssetStatusBadge
        id="asset-1"
        status="AVAILABLE"
        asset={qtAssetPartlyHeld()}
      />,
    );

    expect(
      apiQueryCalls
        .filter((call) => call.api.includes("quantity-breakdown"))
        .every((call) => !call.enabled),
    ).toBe(true);
  });

  it("never fetches for an individually-tracked asset", () => {
    // There is no breakdown to fetch — one thing is either held or it is not.
    render(
      <AssetStatusBadge
        id="asset-1"
        status="IN_CUSTODY"
        asset={{ type: "INDIVIDUAL", quantity: 1, custody: null }}
      />,
    );

    expect(screen.getByText("In custody")).toBeTruthy();
    expect(
      apiQueryCalls
        .filter((call) => call.api.includes("quantity-breakdown"))
        .every((call) => !call.enabled),
    ).toBe(true);
  });

  it("shows the lifecycle stage for an asset still awaiting approval", () => {
    // `PENDING` is not an `AssetStatus` — an item that has not been approved
    // yet has no meaningful availability, so the stage wins over the status.
    render(
      <AssetStatusBadge
        id="asset-1"
        status="AVAILABLE"
        asset={{ type: "INDIVIDUAL", quantity: 1, lifecycleStage: "PENDING" }}
      />,
    );

    expect(screen.getByText("status.PENDING")).toBeTruthy();
  });
});
