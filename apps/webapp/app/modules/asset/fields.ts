import type { Prisma } from "@prisma/client";

export const LOCATION_WITH_HIERARCHY = {
  select: {
    id: true,
    name: true,
    parentId: true,
    _count: {
      select: {
        children: true,
      },
    },
  },
} satisfies Prisma.LocationDefaultArgs;

export const getAssetOverviewFields = (canUseBarcodes: boolean = false) => {
  const baseFields = {
    category: true,
    qrCodes: true,
    // `quantity` is pulled so loaders can show per-location slices and
    // derive the "placed / unplaced" split for qty-tracked assets.
    assetLocations: {
      select: {
        quantity: true,
        location: LOCATION_WITH_HIERARCHY,
      },
    },
    custody: {
      select: {
        createdAt: true,
        quantity: true,
        custodian: {
          include: {
            user: true,
          },
        },
      },
    },
    organization: {
      select: {
        currency: true,
      },
    },
    customFields: {
      where: {
        customField: {
          active: true,
          deletedAt: null,
        },
      },
      include: {
        customField: {
          select: {
            id: true,
            name: true,
            helpText: true,
            required: true,
            type: true,
            categories: true,
            options: true,
          },
        },
      },
    },
    assetModel: { select: { id: true, name: true } },
  } satisfies Prisma.AssetInclude;

  if (canUseBarcodes) {
    return {
      ...baseFields,
      barcodes: {
        select: {
          id: true,
          type: true,
          value: true,
        },
      },
    } satisfies Prisma.AssetInclude;
  }

  // Always fetch barcode count so we can show a "locked" indicator
  return {
    ...baseFields,
    _count: {
      select: {
        barcodes: true,
      },
    },
  } satisfies Prisma.AssetInclude;
};

/**
 * Include fields for the simple asset index.
 *
 * It used to take `bookingFrom` / `bookingTo` / `unavailableBookingStatuses`
 * and swap in a wider `bookingAssets` include when an availability window was
 * being previewed. Nothing supplies those any more, and the pivot they selected
 * belongs to the removed booking system.
 *
 * @returns Prisma include object for asset queries
 */
export const assetIndexFields = () => {
  const fields = {
    category: true,
    // `quantity` is pulled so loaders can show per-location slices and
    // derive the "placed / unplaced" split for qty-tracked assets.
    assetLocations: {
      select: {
        quantity: true,
        location: LOCATION_WITH_HIERARCHY,
      },
    },
    custody: {
      select: {
        quantity: true,
        custodian: {
          select: {
            name: true,
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
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
    // why: customFields used to be eagerly loaded here for every asset row.
    // The simple asset index doesn't render them (only the advanced columns
    // do), and on a 13k-asset workspace this multi-row include scaled with
    // the number of active custom fields. Advanced mode uses
    // advancedAssetIndexFields below; the command-palette search re-adds
    // customFields via extraInclude.
    qrCodes: {
      select: { id: true },
      take: 1,
    },
    // Asset-code resolution: surfaces the linked barcodes so `resolveDisplayCode`
    // (in `app/modules/barcode/display.ts`) can render the workspace-preferred
    // or per-asset-override code on list views. Narrow select keeps payload small.
    barcodes: {
      select: { id: true, type: true, value: true },
    },
  } satisfies Prisma.AssetInclude;

  return fields;
};

export const advancedAssetIndexFields = () => {
  const fields = {
    category: true,
    assetLocations: {
      select: {
        quantity: true,
        location: { select: { name: true } },
      },
    },
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
                email: true,
              },
            },
          },
        },
      },
    },
    customFields: {
      where: {
        customField: {
          active: true,
          deletedAt: null,
        },
      },
      include: {
        customField: {
          select: {
            id: true,
            name: true,
            helpText: true,
            required: true,
            type: true,
            categories: true,
          },
        },
      },
    },
  };

  return fields;
};
