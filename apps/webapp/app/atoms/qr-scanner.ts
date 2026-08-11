import { atom } from "jotai";
import { getPrimaryLocation } from "~/modules/asset/utils";
import type { AssetFromQr } from "~/routes/api+/get-scanned-item.$qrId";

export type ScanListItems = {
  [key: string]: ScanListItem;
};

export type ScanListItem =
  | {
      data?: AssetFromQr;
      error?: string;
      type?: "asset";
      codeType?: "qr" | "barcode" | "samId"; // Track whether this came from QR, barcode, or SAM ID
    }
  | undefined;

/***********************
 * Scanned QR Id Atom  *
 *
 * The data is structured in a object where:
 * - key: qrId
 * - value: asset
 *
 ***********************/

export const scannedItemsAtom = atom<ScanListItems>({});

/**
 * Per-asset quantity for QUANTITY_TRACKED scans. Keyed by `assetId` (not
 * qrId — multiple QR codes can map to the same asset). Drawers default
 * the displayed value to 1 when an entry is missing, so missing keys
 * are safe; clear paths still drop the map to keep memory tidy.
 *
 * @see {@link scannedItemsAtom} — kept in sync via the remove/clear
 *   atoms below so removing an item also drops its qty entry.
 */
export const scannedAssetQuantitiesAtom = atom<Record<string, number>>({});

/**
 * Writer atom that updates a single asset's scanned quantity. Drawer
 * qty inputs dispatch this on every change. Pass `qty = undefined` (or
 * the asset's id only) to drop the entry entirely; missing entries
 * fall back to the drawer's default (1).
 */
export const setScannedAssetQuantityAtom = atom(
  null,
  (get, set, payload: { assetId: string; quantity: number | undefined }) => {
    const current = get(scannedAssetQuantitiesAtom);
    if (payload.quantity == null) {
      const { [payload.assetId]: _, ...rest } = current;
      set(scannedAssetQuantitiesAtom, rest);
      return;
    }
    set(scannedAssetQuantitiesAtom, {
      ...current,
      [payload.assetId]: payload.quantity,
    });
  },
);

/**
 * A derived atom that extracts asset IDs from the scanned items.
 * This avoids repeatedly filtering the items in different components.
 *
 * @returns An object containing the array of assetIds
 */
export const scannedItemIdsAtom = atom((get) => {
  const items = get(scannedItemsAtom);

  // Extract asset IDs from items of type "asset"
  const assetIds = Object.values(items)
    .filter((item) => !!item && item.data && item.type === "asset")
    .map((item) => item?.data?.id);

  return { assetIds, idsTotalCount: assetIds.length };
});

/** Stores info about the last duplicate scan so consumers can show a toast / highlight. */
export type DuplicateScanInfo = {
  qrId: string;
  assetTitle: string;
  timestamp: number;
};
export const lastDuplicateScanAtom = atom<DuplicateScanInfo | null>(null);

// Add item to object with value `undefined` (just receives the key)
export const addScannedItemAtom = atom(
  null,
  (
    get,
    set,
    qrId: string,
    error?: string,
    codeType?: "qr" | "barcode" | "samId",
  ) => {
    const currentItems = get(scannedItemsAtom);
    if (!currentItems[qrId]) {
      /** Set can optionally receive error. If it does, add it to the item.
       * This is used for errors that are related to the QR code itself, not the item.
       */
      set(scannedItemsAtom, {
        [qrId]: error
          ? {
              error: error,
              codeType,
            }
          : {
              codeType,
            }, // Add the new entry at the start
        ...currentItems, // Spread the rest of the existing items
      });
    } else {
      // QR already in list – signal duplicate so consumers can show toast/highlight
      const existingItem = currentItems[qrId];
      if (existingItem?.data) {
        const title = existingItem.data.title;
        set(lastDuplicateScanAtom, {
          qrId,
          assetTitle: title || "Unknown",
          timestamp: Date.now(),
        });
      }
    }
  },
);

// Update item based on key
export const updateScannedItemAtom = atom(
  null,
  (get, set, { qrId, item }: { qrId: string; item: ScanListItem }) => {
    const currentItems = get(scannedItemsAtom);

    // Check if the item already exists with data; if it does, skip the update
    // Allow updates if the current item doesn't have data (just codeType or undefined)
    const currentItem = currentItems[qrId];
    if (!item || (currentItem && currentItem.data)) {
      return; // Skip the update if the item is already present with data
    }

    // Check for duplicate assets by ID before adding
    if (item && item.data && item.type) {
      const assetId = item.data.id;

      // Look for existing items with the same asset ID
      const existingDuplicateKey = Object.entries(currentItems).find(
        ([key, existingItem]) => {
          if (key === qrId) return false; // Don't compare with self
          return (
            existingItem?.data?.id === assetId &&
            existingItem?.type === item.type
          );
        },
      );

      if (existingDuplicateKey) {
        // Add the duplicate with an error message instead of blocking silently
        const duplicateItem: ScanListItem = {
          error: `This ${item.type} is already in the list.`,
          codeType: item.codeType,
        };

        set(scannedItemsAtom, {
          ...currentItems,
          [qrId]: duplicateItem,
        });
        return;
      }
    }

    if ((item && item?.data && item?.type) || item?.error) {
      set(scannedItemsAtom, {
        ...currentItems,
        [qrId]: item,
      });
    }
  },
);

// Remove item based on key
export const removeScannedItemAtom = atom(null, (get, set, qrId: string) => {
  const currentItems = get(scannedItemsAtom);
  // Drop the matching scanned-item entry plus any qty entry for the
  // removed asset (qty map is keyed by assetId, not qrId).
  const removedAssetId = currentItems[qrId]?.data?.id;
  const { [qrId]: _, ...rest } = currentItems;
  set(scannedItemsAtom, rest);
  if (removedAssetId) {
    const currentQty = get(scannedAssetQuantitiesAtom);
    const { [removedAssetId]: __, ...qtyRest } = currentQty;
    set(scannedAssetQuantitiesAtom, qtyRest);
  }
});

// Remove multiple items based on key array
export const removeMultipleScannedItemsAtom = atom(
  null,
  (get, set, qrIds: string[]) => {
    const currentItems = get(scannedItemsAtom);
    const updatedItems = { ...currentItems };
    const removedAssetIds: string[] = [];
    qrIds.forEach((qrId) => {
      const id = currentItems[qrId]?.data?.id;
      if (id) removedAssetIds.push(id);
      delete updatedItems[qrId];
    });
    set(scannedItemsAtom, updatedItems);
    if (removedAssetIds.length > 0) {
      const currentQty = get(scannedAssetQuantitiesAtom);
      const qtyRest = { ...currentQty };
      removedAssetIds.forEach((id) => {
        delete qtyRest[id];
      });
      set(scannedAssetQuantitiesAtom, qtyRest);
    }
  },
);

// Remove items based on asset id
export const removeScannedItemsByAssetIdAtom = atom(
  null,
  (get, set, ids: string[]) => {
    const currentItems = get(scannedItemsAtom);
    const updatedItems = { ...currentItems };
    Object.entries(currentItems).forEach(([qrId, item]) => {
      if (item?.data?.id && ids.includes(item?.data?.id)) {
        delete updatedItems[qrId];
      }
    });
    set(scannedItemsAtom, updatedItems);
    const currentQty = get(scannedAssetQuantitiesAtom);
    const qtyRest = { ...currentQty };
    ids.forEach((id) => {
      delete qtyRest[id];
    });
    set(scannedAssetQuantitiesAtom, qtyRest);
  },
);

// Clear all items
export const clearScannedItemsAtom = atom(null, (_get, set) => {
  set(scannedItemsAtom, {}); // Resets the atom to an empty object
  set(scannedAssetQuantitiesAtom, {}); // Drop any qty entries too.
});

/*******************************/

/* AUDIT-SPECIFIC ATOMS */

export type AuditSessionInfo = {
  id: string;
  name: string;
  targetId?: string | null;
  contextType?: string | null;
  contextName?: string | null;
  expectedAssetCount: number;
  foundAssetCount: number;
  missingAssetCount: number;
  unexpectedAssetCount: number;
} | null;

export type AuditAssetStatus = "found" | "missing" | "unexpected";

export type AuditScannedItem = {
  id: string;
  name: string;
  type: "asset";
  auditStatus: AuditAssetStatus;
  expectedLocation?: string;
  currentLocation?: string;
  locationName?: string | null;
  auditAssetId?: string; // Link to AuditAsset record for notes/images
  auditNotesCount?: number;
  auditImagesCount?: number;
  mainImage?: string | null;
  thumbnailImage?: string | null;
};

export type AuditAssetMeta = {
  notesCount?: number;
  imagesCount?: number;
};

// Stores current audit session information
export const auditSessionAtom = atom<AuditSessionInfo>(null);

// Stores expected assets for the current audit target (location)
export const auditExpectedAssetsAtom = atom<AuditScannedItem[]>([]);
// Local, client-side overrides for live note/image counts per audit asset.
export const auditAssetMetaAtom = atom<Record<string, AuditAssetMeta>>({});

// Derived atom that categorizes scanned items by audit status
export const auditResultsAtom = atom((get) => {
  const items = get(scannedItemsAtom);
  const expectedAssets = get(auditExpectedAssetsAtom);
  const sessionInfo = get(auditSessionAtom);

  if (!sessionInfo) {
    return {
      found: [] as AuditScannedItem[],
      missing: expectedAssets,
      unexpected: [] as AuditScannedItem[],
    };
  }

  // Create a map of expected asset IDs for quick lookup
  const expectedAssetIds = new Set(expectedAssets.map((asset) => asset.id));

  // Process scanned items
  const scannedAssets: AuditScannedItem[] = Object.values(items)
    .filter((item) => !!item && item.data && item.type === "asset")
    .map((item) => {
      const assetData = item!.data as AssetFromQr;
      return {
        id: assetData.id,
        name: assetData.title,
        type: "asset" as const,
        auditStatus: expectedAssetIds.has(assetData.id)
          ? ("found" as const)
          : ("unexpected" as const),
        locationName: getPrimaryLocation(assetData)?.name ?? null,
      } satisfies AuditScannedItem;
    });

  // Categorize assets
  const found = scannedAssets.filter((asset) => asset.auditStatus === "found");
  const unexpected = scannedAssets.filter(
    (asset) => asset.auditStatus === "unexpected",
  );
  const foundIds = new Set(found.map((asset) => asset.id));
  const missing = expectedAssets.filter((asset) => !foundIds.has(asset.id));

  return {
    found,
    missing,
    unexpected,
  };
});

// Action atom to set expected assets for audit
export const setAuditExpectedAssetsAtom = atom(
  null,
  (_get, set, assets: AuditScannedItem[]) => {
    set(auditExpectedAssetsAtom, assets);
    // Seed meta counts from loader data so UI starts with server values.
    set(
      auditAssetMetaAtom,
      assets.reduce<Record<string, AuditAssetMeta>>((acc, asset) => {
        if (!asset.auditAssetId) return acc;
        acc[asset.auditAssetId] = {
          notesCount: asset.auditNotesCount ?? 0,
          imagesCount: asset.auditImagesCount ?? 0,
        };
        return acc;
      }, {}),
    );
  },
);

export const incrementAuditAssetMetaAtom = atom(
  null,
  (
    get,
    set,
    {
      auditAssetId,
      notesDelta = 0,
      imagesDelta = 0,
    }: {
      auditAssetId: string;
      notesDelta?: number;
      imagesDelta?: number;
    },
  ) => {
    const current = get(auditAssetMetaAtom);
    const existing = current[auditAssetId] ?? {};
    // Keep counts in sync with local optimistic actions.
    const nextNotes = (existing.notesCount ?? 0) + notesDelta;
    const nextImages = (existing.imagesCount ?? 0) + imagesDelta;
    set(auditAssetMetaAtom, {
      ...current,
      [auditAssetId]: {
        ...existing,
        notesCount: Math.max(0, nextNotes),
        imagesCount: Math.max(0, nextImages),
      },
    });
  },
);

// Action atom to start an audit session
export const startAuditSessionAtom = atom(
  null,
  (_get, set, sessionInfo: Exclude<AuditSessionInfo, null>) => {
    set(auditSessionAtom, sessionInfo);
    // Clear any existing scanned items when starting a new audit
    set(scannedItemsAtom, {});
    set(auditAssetMetaAtom, {});
  },
);

// Action atom to end an audit session
export const endAuditSessionAtom = atom(null, (_get, set) => {
  set(auditSessionAtom, null);
  set(auditExpectedAssetsAtom, []);
  set(scannedItemsAtom, {});
  set(auditAssetMetaAtom, {});
});

/*******************************/

/* BOOKING PARTIAL-CHECKIN ATOMS */
