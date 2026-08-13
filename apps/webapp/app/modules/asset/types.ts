import type { RenderableTreeNode } from "@markdoc/markdoc";
import type {
  Asset,
  AssetCustomFieldValue,
  Location,
  Category,
  CustomField,
  Prisma,
  User,
  CustomFieldType,
  AssetReminder,
  Organization,
  BarcodeType,
  Barcode,
} from "@prisma/client";
import type { Return } from "@prisma/client/runtime/library";
import type { assetIndexFields } from "./fields";

export interface ICustomFieldValueJson {
  raw: string | number | boolean;
  valueText?: string;
  valueBoolean?: boolean;
  valueDate?: string;
  valueOption?: string;
  valueMultiLineText?: RenderableTreeNode;
}

export type ShelfAssetCustomFieldValueType = Omit<
  AssetCustomFieldValue,
  "value"
> & { value: ICustomFieldValueJson };

export interface UpdateAssetPayload {
  id: Asset["id"];
  title?: Asset["title"];
  description?: Asset["description"];
  /** Pass 'uncategorized' to clear the category */
  categoryId?: Asset["categoryId"];
  /** Pass null to clear the asset model association */
  assetModelId?: string | null;
  // `Asset.locationId` no longer exists (location lives on the
  // `AssetLocation` pivot). These carry the single primary-location id
  // through the update flow.
  newLocationId?: string | null;
  currentLocationId?: string | null;
  /**
   * Per-asset single-location qty for QUANTITY_TRACKED placements via
   * the asset-overview update-location dialog. When provided alongside
   * `newLocationId`, the new pivot row uses this value (subject to the
   * orthogonal-MAX re-validation in `updateAsset`). Falls back to
   * `Asset.quantity` (full pool) when omitted — preserves back-compat
   * for paths that don't expose a qty input yet (bulk + scan + mobile).
   */
  newLocationQuantity?: number;
  mainImage?: Asset["mainImage"];
  thumbnailImage?: string | null;
  mainImageExpiration?: Asset["mainImageExpiration"];
  userId: User["id"];
  customFieldsValues?: ShelfAssetCustomFieldValueType[];
  barcodes?: { id?: string; type: BarcodeType; value: string }[];
  /**
   * Per-asset override of the displayed identifier in list views.
   * - `undefined` → leave the column unchanged
   * - `null` or `""` → clear the override (follow workspace default)
   * - a string → set to that specific Barcode.id (validated to belong to this asset)
   */
  preferredBarcodeId?: Asset["preferredBarcodeId"] | undefined;
  valuation?: Asset["valuation"];
  organizationId: Organization["id"];
  request: Request;
  quantity?: Asset["quantity"];
  minQuantity?: Asset["minQuantity"];
  consumptionType?: Asset["consumptionType"];
  unitOfMeasure?: Asset["unitOfMeasure"];
}

export interface CreateAssetFromContentImportPayload
  extends Record<string, any> {
  key: string; // Unique identifier for the asset in the import (this is generated while parsing the csv file)
  title: string;
  description?: string;
  category?: string;
  location?: string;
  custodian?: string;
  bookable?: "yes" | "no";
  imageUrl?: string; // URL of the image to import
  /** AssetModel reference by name (case-insensitive). Resolved /
   * upserted via createAssetModelsIfNotExists during import. */
  assetModel?: string;
  /** AssetType — defaults to INDIVIDUAL when omitted */
  type?: "INDIVIDUAL" | "QUANTITY_TRACKED";
  /** Required (>0) for QUANTITY_TRACKED; defaults to 1 for INDIVIDUAL */
  quantity?: string;
  /** Optional low-stock threshold for QUANTITY_TRACKED */
  minQuantity?: string;
  /** Free-form text label ("boxes", "kg", …) for QUANTITY_TRACKED */
  unitOfMeasure?: string;
  /** Required for QUANTITY_TRACKED. ONE_WAY (consumed on checkout) or
   * TWO_WAY (returned with consumption report). */
  consumptionType?: "ONE_WAY" | "TWO_WAY";
}

export interface CreateAssetFromBackupImportPayload
  extends Record<string, any> {
  id: string;
  title: string;
  description?: string;
  category:
    | {
        id: string;
        name: string;
        description: string;
        color: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
      }
    | {};
  location:
    | {
        name: string;
        description?: string;
        address?: string;
        createdAt: string;
        updatedAt: string;
      }
    | {};
  customFields: AssetCustomFieldsValuesWithFields[];
}

export type AssetCustomFieldsValuesWithFields =
  ShelfAssetCustomFieldValueType & {
    customField: CustomField;
  };

/** Item returned by getAssetsFromView */
export type AssetsFromViewItem = Prisma.AssetGetPayload<{
  include: Return<typeof assetIndexFields>;
}>;

/** Type for advanced index query. We cannot infer it because we do a raw query so we need to create it ourselves. */
export type AdvancedIndexAsset = Pick<
  Asset,
  | "id"
  | "sequentialId"
  | "title"
  | "description"
  | "createdAt"
  | "updatedAt"
  | "userId"
  | "mainImage"
  | "thumbnailImage"
  | "mainImageExpiration"
  | "categoryId"
  | "organizationId"
  | "status"
  | "type"
  | "valuation"
  | "quantity"
  | "unitOfMeasure"
  | "minQuantity"
  | "consumptionType"
  | "availableToBook"
  | "lifecycleStage"
> & {
  qrId: string; // QR code will always be available
  assetModelId?: string | null;
  assetModelName?: string | null;
  category: Pick<Category, "id" | "name" | "color"> | null;
  /** Primary placement (oldest pivot row) — see `kit` above. */
  location:
    | (Pick<Location, "id" | "name"> & {
        parentId?: Location["parentId"];
        childCount?: number;
      })
    | null;
  /** Full placement list for the asset, ordered by
   * `AssetLocation.createdAt`. Mirror of `kits`. Always an array. */
  locations: Array<
    Pick<Location, "id" | "name"> & {
      parentId?: Location["parentId"];
      childCount?: number;
    }
  >;
  custody:
    | {
        /** Custodian display name; mirrored at the top level so callers
         * can read it without descending into `custodian`. */
        name?: string;
        /** Per-custody quantity; meaningful for QUANTITY_TRACKED assets
         * where the same asset can be split across multiple custodians.
         * Optional because the booking-derived synthetic custody case
         * does not project a quantity. */
        quantity?: number;
        custodian: {
          name: string;
          user: {
            id: string;
            firstName: string | null;
            lastName: string | null;
            profilePicture: string | null;
            email: string;
          } | null;
        };
      }[]
    | null;
  customFields: (AssetCustomFieldValue & {
    customField: Pick<
      CustomField,
      "id" | "name" | "helpText" | "required" | "type" | "options"
    > & {
      categories: Pick<Category, "id" | "name">[] | null;
    };
  })[];
  upcomingReminder?: Pick<
    AssetReminder,
    "id" | "alertDateTime" | "name" | "message"
  >;
  barcodes?: Array<Pick<Barcode, "id" | "type" | "value">>;
};
// Type for the entire query result
export type AdvancedIndexQueryResult = Array<{
  total_count: number;
  assets: AdvancedIndexAsset[]; // This is now guaranteed to be an array, never null
}>;

export interface CustomFieldSorting {
  name: string;
  valueKey: string;
  alias: string;
  fieldType?: CustomFieldType;
}
