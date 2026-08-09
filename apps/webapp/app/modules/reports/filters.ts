/**
 * Reading a report's filters out of the URL — one definition, three consumers.
 *
 * ## The bug this exists to kill
 *
 * The screen read every filter (`?categories=`, `?locations=`, `?statuses=`,
 * `?timeframe=`…) and passed them to the report. The **CSV export and the PDF
 * export did not**: both called the same report functions with nothing but
 * `organizationId` and a huge page size.
 *
 * So an operator filtered الجرد down to one location, pressed تصدير, and got a
 * file containing every asset in the workspace — with no error, no warning, and
 * a filename that says it is the filtered report. The PDF route even parsed the
 * search params under a `// Parse filters` comment and then never used the
 * result, which is what the intent had been.
 *
 * A filtered view and its export disagreeing is worse than either being wrong
 * alone: the export is what gets mailed, filed and signed.
 *
 * ## Why a shared reader rather than three careful copies
 *
 * Three copies is exactly how this drifted the first time. A filter added to a
 * report now lands in the screen and both exports together, or in none of them.
 *
 * Paging is deliberately **not** here: the screen pages, the exports take
 * everything. That is the one thing the three call sites legitimately disagree
 * about, so each supplies its own.
 *
 * @see {@link file://./helpers.server.ts} the report functions these feed
 * @see {@link file://./../../routes/_layout+/reports.$reportId.tsx} the screen
 */

import { resolveTimeframe } from "./timeframe";
import type { TimeframePreset } from "./types";

/** A comma-separated multi-select param, or undefined when absent/empty. */
function list(
  searchParams: URLSearchParams,
  key: string,
): string[] | undefined {
  const values = searchParams.get(key)?.split(",").filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

/** A single-value param, or undefined when absent/empty. */
function one(searchParams: URLSearchParams, key: string): string | undefined {
  return searchParams.get(key) || undefined;
}

/**
 * The timeframe a report was asked for.
 *
 * Defaults to `last_30d`, matching what the screen shows before anyone touches
 * the picker — an export of an untouched report must cover the same window the
 * operator was looking at.
 *
 * @param searchParams - The request's query string
 * @returns The resolved range
 */
export function readTimeframe(searchParams: URLSearchParams) {
  const preset =
    (searchParams.get("timeframe") as TimeframePreset) || "last_30d";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  return resolveTimeframe(
    preset,
    from ? new Date(from) : undefined,
    to ? new Date(to) : undefined,
  );
}

/*
 * One reader per report rather than a single `Record<string, unknown>` switch.
 *
 * The union version compiled and then dropped `timeframe` on the floor at one
 * call site — `unknown` values spread into a typed argument tell TypeScript
 * nothing. With a typed reader each, a missing or misnamed filter is a compile
 * error at the call site, which is the entire point of centralising them.
 *
 * The `distribution` report has no reader because it takes no filters; adding
 * an empty one would suggest there are filters it is ignoring.
 */

/** `?days=`, `?category=`, `?location=` — الأصناف الراكدة. */
export function readIdleAssetsFilters(searchParams: URLSearchParams): {
  idleThresholdDays: number;
  categoryId?: string;
  locationId?: string;
} {
  return {
    idleThresholdDays: parseInt(searchParams.get("days") || "30", 10),
    categoryId: one(searchParams, "category"),
    locationId: one(searchParams, "location"),
  };
}

/** `?teamMember=`, `?location=` — العهد الحالية. */
export function readCustodySnapshotFilters(searchParams: URLSearchParams): {
  teamMemberId?: string;
  locationId?: string;
} {
  return {
    teamMemberId: one(searchParams, "teamMember"),
    locationId: one(searchParams, "location"),
  };
}

/** `?categories=`, `?locations=`, `?statuses=` — الجرد. */
export function readAssetInventoryFilters(searchParams: URLSearchParams): {
  categoryIds?: string[];
  locationIds?: string[];
  statuses?: string[];
} {
  return {
    categoryIds: list(searchParams, "categories"),
    locationIds: list(searchParams, "locations"),
    statuses: list(searchParams, "statuses"),
  };
}

/** `?timeframe=`/`?from=`/`?to=`, `?asset=`, `?category=` — حركة الأصناف. */
export function readAssetActivityFilters(searchParams: URLSearchParams): {
  timeframe: ReturnType<typeof resolveTimeframe>;
  assetId?: string;
  categoryId?: string;
} {
  return {
    timeframe: readTimeframe(searchParams),
    assetId: one(searchParams, "asset"),
    categoryId: one(searchParams, "category"),
  };
}
