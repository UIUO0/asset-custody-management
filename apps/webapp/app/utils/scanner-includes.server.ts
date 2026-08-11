import type { Prisma } from "@prisma/client";

export const CUSTODY_INCLUDE = {
  custody: {
    select: {
      custodian: {
        select: {
          name: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              displayName: true,
              profilePicture: true,
            },
          },
        },
      },
    },
  },
};

/**
 * Scanner-facing Asset include.
 *
 * Uses Prisma `include` (no top-level `select`) so all Asset scalar
 * columns ship by default. Scanner drawers — notably
 * `partial-checkout-drawer`'s `isCheckoutEligibleAsset` filter and
 * `AssetRow` — depend on `status` and `type` being present on every
 * asset payload returned by `/api/get-scanned-item/$qrId` and
 * `/api/get-scanned-item-by-barcode`. Do not narrow this to `select`
 * without re-adding `status` and `type` explicitly.
 */
export const ASSET_INCLUDE = {
  // Asset placement lives on the `AssetLocation` pivot. Consumers read
  // the primary placement via `getPrimaryLocation`.
  assetLocations: {
    select: {
      location: { select: { id: true, name: true } },
    },
  },
  ...CUSTODY_INCLUDE,
};

export const QR_INCLUDE = {
  asset: {
    include: ASSET_INCLUDE,
  },
};

export const BARCODE_INCLUDE = {
  asset: {
    include: ASSET_INCLUDE,
  },
};

// Type exports for reuse

/**
 * Ambient picker meta the scanner API attaches when a destination
 * context (location / kit / booking) is provided in the query string.
 * Kept here as an optional field instead of a Prisma include so it
 * survives the `Prisma.AssetGetPayload<>` type derivation without
 * forcing every consumer to know about it. Always `null` for
 * INDIVIDUAL assets and for calls without `pickerContext`.
 *
 * @see {@link file://./../modules/scanner/picker-meta.server.ts} ScannerPickerMeta
 */
export type ScannerAssetPickerMeta = {
  maxAllowed: number;
  assetQuantity: number;
  unitOfMeasure: string | null;
} | null;

export type AssetFromScanner = Prisma.AssetGetPayload<{
  include: typeof ASSET_INCLUDE;
}> & {
  pickerMeta?: ScannerAssetPickerMeta;
};
