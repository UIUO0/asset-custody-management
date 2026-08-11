import type { Asset } from "@prisma/client";

/**
 * Normalizes a QR row into the item it points at.
 *
 * A code used to be linkable to an asset *or* a kit; kits are gone, so the
 * only linkable target is an asset. The `type` field is kept — callers switch
 * on it, and an unlinked code still has to read as `null` rather than as an
 * asset with no title.
 */
export function normalizeQrData(qr: {
  id: string;
  assetId?: string | null;
  // Use Partial and Pick to relax the requirement on callers' selects.
  asset?: Partial<Pick<Asset, "id" | "title">> | null;
}): {
  item: Asset | null;
  type: "asset" | null;
  normalizedName: string;
} {
  if (!qr.assetId || !qr.asset) {
    return { item: null, type: null, normalizedName: "" };
  }

  const item = qr.asset as Asset;

  return { item, type: "asset", normalizedName: item.title };
}
