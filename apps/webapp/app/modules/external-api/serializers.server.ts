/**
 * Public response shapes for the external API.
 *
 * Every `/api/v1` handler passes its Prisma rows through a function here rather
 * than returning them directly. That indirection is the point: the database
 * schema changes for internal reasons — pivots replacing columns, fields added
 * for a new workflow — and an integration written against `/api/v1/assets`
 * two years ago must keep receiving the same JSON.
 *
 * Anything absent from these shapes is not part of the contract. In particular
 * no internal user ids, no `Qr` secrets, and no soft-delete or workflow columns
 * that would leak how the system works internally.
 *
 * Each serializer is paired with a `*_SELECT` constant so the query fetches
 * exactly what the shape needs — no over-fetching, and a field added to the
 * shape without a matching select fails at compile time.
 *
 * @see {@link file://./response.server.ts} the envelope around these
 */

/** Columns needed to serialize an asset. */
export const API_ASSET_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  lifecycleStage: true,
  availableToBook: true,
  sequentialId: true,
  valuation: true,
  type: true,
  quantity: true,
  minQuantity: true,
  unitOfMeasure: true,
  mainImage: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  tags: { select: { id: true, name: true } },
  // Location and kit live on pivots (`AssetLocation` / `AssetKit`); the
  // serializer flattens the primary row so the public shape stays flat.
  assetLocations: {
    select: { location: { select: { id: true, name: true } } },
  },
  assetKits: {
    select: { kit: { select: { id: true, name: true } } },
  },
  // Custodian name only. The custodian's user id is internal and deliberately
  // withheld — an external system has no way to act on it and no need for it.
  custody: {
    orderBy: { createdAt: "asc" },
    select: { quantity: true, custodian: { select: { name: true } } },
  },
} as const;

export type ApiAsset = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  lifecycleStage: string;
  availableToBook: boolean;
  sequentialId: string | null;
  valuation: number | null;
  type: string;
  quantity: number | null;
  minQuantity: number | null;
  unitOfMeasure: string | null;
  mainImage: string | null;
  category: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
  location: { id: string; name: string } | null;
  kit: { id: string; name: string } | null;
  custodians: Array<{ name: string; quantity: number }>;
  createdAt: string;
  updatedAt: string;
};

/**
 * Shapes an asset row for the public API.
 *
 * @param asset - A row selected with {@link API_ASSET_SELECT}
 * @returns The public asset shape
 */
export function serializeAsset(asset: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  lifecycleStage: string;
  availableToBook: boolean;
  sequentialId: string | null;
  valuation: number | null;
  type: string;
  quantity: number | null;
  minQuantity: number | null;
  unitOfMeasure: string | null;
  mainImage: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string }>;
  assetLocations: Array<{ location: { id: string; name: string } }>;
  assetKits: Array<{ kit: { id: string; name: string } }>;
  custody: Array<{ quantity: number; custodian: { name: string } }>;
}): ApiAsset {
  return {
    id: asset.id,
    title: asset.title,
    description: asset.description,
    status: asset.status,
    lifecycleStage: asset.lifecycleStage,
    availableToBook: asset.availableToBook,
    sequentialId: asset.sequentialId,
    valuation: asset.valuation,
    type: asset.type,
    quantity: asset.quantity,
    minQuantity: asset.minQuantity,
    unitOfMeasure: asset.unitOfMeasure,
    mainImage: asset.mainImage,
    category: asset.category,
    tags: asset.tags,
    // INDIVIDUAL assets are capped at one location/kit row by DB triggers, so
    // taking the first is lossless for them. QUANTITY_TRACKED assets may sit at
    // several locations; the public shape reports the primary one.
    location: asset.assetLocations[0]?.location ?? null,
    kit: asset.assetKits[0]?.kit ?? null,
    custodians: asset.custody.map((entry) => ({
      name: entry.custodian.name,
      quantity: entry.quantity,
    })),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

/** A reference-data record: kits, locations, categories all share this shape. */
export type ApiNamedRecord = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Shapes any of the simple reference collections.
 *
 * Kits, locations and categories differ internally but are all "an id, a name
 * and a description" to an integration, so one shape serves all three rather
 * than three near-identical ones drifting apart.
 *
 * @param record - Row with id, name, optional description, and timestamps
 */
export function serializeNamedRecord(record: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ApiNamedRecord {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export type ApiTeamMember = {
  id: string;
  name: string;
  /** Null for non-registered members, who exist only as a name. */
  email: string | null;
  /** Workspace role, or null when the member has no linked account. */
  role: string | null;
  createdAt: string;
};

/**
 * Shapes a team member for the public API.
 *
 * Only the name, email and workspace role are exposed. Profile pictures,
 * internal user ids and custody counts are not part of the contract.
 *
 * @param member - Team member row with its optional linked user
 */
export function serializeTeamMember(member: {
  id: string;
  name: string;
  createdAt: Date;
  user: {
    email: string;
    userOrganizations: Array<{ roles: string[] }>;
  } | null;
}): ApiTeamMember {
  return {
    id: member.id,
    name: member.name,
    email: member.user?.email ?? null,
    role: member.user?.userOrganizations[0]?.roles[0] ?? null,
    createdAt: member.createdAt.toISOString(),
  };
}
