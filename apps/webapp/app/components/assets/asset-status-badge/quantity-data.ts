/**
 * Quantity Breakdown Data
 *
 * Pure derivations + types behind the asset status badge's quantity-aware
 * rendering: how many units of a quantity-tracked asset are in custody, how
 * many are left, and which label and colour say so.
 *
 * Lives outside the badge component so non-React consumers (server loaders,
 * tests) can share the shape. The lazy-fetch API endpoint at
 * `/api/assets/$assetId/quantity-breakdown` returns data conforming to
 * {@link QuantityAwareAsset} so the client can feed it straight into
 * {@link getQuantityData}.
 *
 * ## The booking half is gone
 *
 * This file used to reduce `bookingAssets` into `reserved` and `checkedOut`
 * counts, with a documented contract about subtracting partial-checkout claims
 * for ONGOING/OVERDUE rows. All of it went with the booking system: no booking
 * can exist, `getAssetQuantityRows` no longer selects the pivot, and both
 * counts were therefore always zero — arithmetic that could only ever produce
 * one answer, plus a tooltip branch nobody could reach.
 *
 * @see {@link file://./quantity-tooltip-content.tsx}
 * @see {@link file://./asset-status-badge.tsx}
 */

import type { AssetType } from "@prisma/client";
import { ASSET_QTY_STATUS_LABELS } from "@shelf/labels";
import { isQuantityTracked } from "~/modules/asset/utils";
import { BADGE_COLORS, type BadgeColorScheme } from "~/utils/badge-colors";

/** Shape for an asset-kit pivot record used to resolve kit names from assetKitId */
export interface AssetKitRecord {
  id?: string;
  kit?: { id?: string; name?: string } | null;
  [key: string]: unknown;
}

/**
 * Minimal asset shape needed for quantity-aware status display.
 * Kept lightweight so any call site with the asset object can pass it.
 */
export interface QuantityAwareAsset {
  type?: AssetType | null;
  quantity?: number | null;
  custody?:
    | Array<{ quantity?: number; [key: string]: unknown }>
    | { quantity?: number; [key: string]: unknown }
    | null;
  /** AssetKit pivot records, so kit-allocated units can be named */
  assetKits?: AssetKitRecord[] | null;
  /** Allow additional properties so any asset-like object can be passed */
  [key: string]: unknown;
}

/**
 * Computes the quantity breakdown from an asset's custody records.
 *
 * @param asset - Any asset-like object carrying `type`, `quantity`, `custody`
 * @returns The breakdown, or `null` for a non-quantity-tracked asset or one
 *   with nothing in custody — in which case the caller falls through to the
 *   standard status badge
 */
export function getQuantityData(asset?: QuantityAwareAsset | null) {
  if (!asset || !isQuantityTracked(asset)) return null;

  const total = asset.quantity ?? 0;

  const custodyArray = Array.isArray(asset.custody)
    ? asset.custody
    : asset.custody
    ? [asset.custody]
    : [];
  const inCustody = custodyArray.reduce((sum, c) => sum + (c.quantity ?? 0), 0);

  /* Nothing to show — fall through to standard status badge */
  if (inCustody === 0) return null;

  const available = total - inCustody;

  /* AssetKit rows so the tooltip can name a kit-allocated slice. */
  const assetKits: AssetKitRecord[] = Array.isArray(asset.assetKits)
    ? asset.assetKits
    : [];

  return {
    total,
    inCustody,
    available,
    assetKits,
  };
}

/** Return type from getQuantityData (non-null case) */
export type QuantityBreakdown = NonNullable<ReturnType<typeof getQuantityData>>;

/**
 * Determines the badge label and colour from the quantity breakdown.
 *
 * "Partially …" whenever some units are still on the shelf.
 *
 * @param data - The breakdown from {@link getQuantityData}
 * @returns The label and its colour scheme
 */
export function getQuantityBadgeLabelAndColor(data: QuantityBreakdown): {
  label: string;
  colors: BadgeColorScheme;
} {
  const { inCustody, available } = data;

  if (inCustody > 0) {
    return {
      label:
        available <= 0
          ? ASSET_QTY_STATUS_LABELS.IN_CUSTODY
          : ASSET_QTY_STATUS_LABELS.PARTIAL_CUSTODY,
      colors: BADGE_COLORS.blue,
    };
  }

  /* Defensive — `getQuantityData` returns null when nothing is in custody */
  return {
    label: ASSET_QTY_STATUS_LABELS.AVAILABLE,
    colors: BADGE_COLORS.green,
  };
}
