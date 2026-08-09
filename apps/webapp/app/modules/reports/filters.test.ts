/**
 * Report filter readers.
 *
 * These exist because the screen, the CSV export and the PDF export each read
 * the filters themselves and two of them silently stopped: a report filtered to
 * one location exported every asset in the workspace, under a filename saying
 * otherwise.
 *
 * So the tests worth having are not "does `?days=60` parse to 60" — they are
 * the properties that make a filter reader safe to spread into a report call:
 * an absent filter must be `undefined` (never an empty array or empty string
 * that narrows the query to nothing), and a present one must survive.
 *
 * @see {@link file://./filters.ts}
 */

import { describe, expect, it } from "vitest";
import {
  readAssetActivityFilters,
  readAssetInventoryFilters,
  readCustodySnapshotFilters,
  readIdleAssetsFilters,
  readTimeframe,
} from "./filters";

const params = (query: string) => new URLSearchParams(query);

describe("readAssetInventoryFilters", () => {
  it("reads the multi-selects the screen writes", () => {
    const filters = readAssetInventoryFilters(
      params("categories=c1,c2&locations=l1&statuses=AVAILABLE,IN_CUSTODY"),
    );

    expect(filters.categoryIds).toEqual(["c1", "c2"]);
    expect(filters.locationIds).toEqual(["l1"]);
    expect(filters.statuses).toEqual(["AVAILABLE", "IN_CUSTODY"]);
  });

  it("returns undefined — not [] — for an absent filter", () => {
    // The distinction is the whole point. `undefined` means "do not filter";
    // an empty array reaching a Prisma `in` means "match nothing", which turns
    // an unfiltered report into an empty one.
    const filters = readAssetInventoryFilters(params(""));

    expect(filters.categoryIds).toBeUndefined();
    expect(filters.locationIds).toBeUndefined();
    expect(filters.statuses).toBeUndefined();
  });

  it("treats an empty or comma-only value as no filter", () => {
    // `?categories=` is what a cleared multi-select posts.
    expect(
      readAssetInventoryFilters(params("categories=")).categoryIds,
    ).toBeUndefined();
    expect(
      readAssetInventoryFilters(params("categories=,,")).categoryIds,
    ).toBeUndefined();
  });
});

describe("readIdleAssetsFilters", () => {
  it("reads the threshold and the single-selects", () => {
    const filters = readIdleAssetsFilters(
      params("days=90&category=c1&location=l1"),
    );

    expect(filters).toEqual({
      idleThresholdDays: 90,
      categoryId: "c1",
      locationId: "l1",
    });
  });

  it("defaults the threshold to 30 days, as the screen does", () => {
    // An export of an untouched report must cover the window the operator was
    // looking at, not a different default.
    expect(readIdleAssetsFilters(params("")).idleThresholdDays).toBe(30);
  });
});

describe("readCustodySnapshotFilters", () => {
  it("reads the custodian and location", () => {
    expect(
      readCustodySnapshotFilters(params("teamMember=tm1&location=l1")),
    ).toEqual({ teamMemberId: "tm1", locationId: "l1" });
  });

  it("returns undefined for absent filters", () => {
    expect(readCustodySnapshotFilters(params(""))).toEqual({
      teamMemberId: undefined,
      locationId: undefined,
    });
  });
});

describe("readAssetActivityFilters", () => {
  it("always supplies a timeframe", () => {
    // `AssetActivityArgs.timeframe` is required, and the export that omitted it
    // is what the compiler caught while this module was being extracted.
    const filters = readAssetActivityFilters(params(""));

    expect(filters.timeframe).toBeDefined();
    expect(filters.timeframe.preset).toBe("last_30d");
  });

  it("honours an explicit preset", () => {
    expect(
      readAssetActivityFilters(params("timeframe=last_7d")).timeframe.preset,
    ).toBe("last_7d");
  });
});

describe("readTimeframe", () => {
  it("uses a custom range when both ends are given", () => {
    const timeframe = readTimeframe(
      params("timeframe=custom&from=2026-01-01&to=2026-01-31"),
    );

    expect(timeframe.preset).toBe("custom");
    expect(timeframe.from.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("defaults to the last 30 days when nothing is asked for", () => {
    expect(readTimeframe(params("")).preset).toBe("last_30d");
  });
});
