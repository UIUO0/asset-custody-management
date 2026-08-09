/**
 * Goods receipts (مذكرة استلام / محضر استلام) — the only way stock enters.
 *
 * A receipt is one delivery: a header, a supplier, its document references, and
 * a table of items. Saving it creates the `Asset` rows, each linked back to the
 * line that admitted it, so any item can be traced to the signed document —
 * and to the supplier, purchase order and price that came with it.
 *
 * ## Two decisions worth knowing before reading
 *
 * **Items are created at save, not at signature.** The warehouse needs stock
 * visible the moment it is booked in. The items land at
 * `AssetLifecycleStage.PENDING`, where employees cannot see them anyway, and
 * the three signatures gate the *approval* to `READY` instead — see
 * `receipt-gate.server.ts`, which lives apart from this module to keep the
 * asset service from importing it in a cycle. Gating data entry on three people
 * being at their desks would mean a delivery sitting unrecorded.
 *
 * **Each line's tracking is the operator's choice.** Ten laptops become ten
 * `INDIVIDUAL` rows with their own QR codes; five hundred pens become one
 * `QUANTITY_TRACKED` row. Forcing either rule on every line makes the other
 * case unusable, so the form asks per line.
 *
 * @see {@link file://./form-shape.ts} how the two forms differ
 * @see {@link file://./classification.ts} أصل/مادة, decided by capitalisation threshold
 * @see {@link file://./../../../../docs/epda-goods-receipt-workflow.md}
 */

import {
  AssetType,
  ConsumptionType,
  GoodsReceiptState,
  GoodsReceiptType,
  type GoodsReceipt,
  type GoodsReceiptParty,
  type ItemCategory,
  type ItemClass,
  type Prisma,
} from "@prisma/client";
import { db } from "~/database/db.server";
import { getSupabaseAdmin } from "~/integrations/supabase/client";
import { createAsset } from "~/modules/asset/service.server";
// Reused rather than reimplemented: the custody service already decides what a
// valid signature payload is, and two answers to that question would drift.
import { decodeSignatureDataUrl } from "~/modules/custody/handover.server";
import { ShelfError, isLikeShelfError } from "~/utils/error";
import { halalasToRiyals, lineTotal } from "~/utils/money";
import { classifyReceiptLine } from "./classification";
import { getFormShape, partiesForType } from "./form-shape";
import type { GoodsReceiptInput, ReceiptLineInput } from "./schema";

const label = "Assets" as const;

/**
 * The client an interactive transaction hands to its callback.
 *
 * Derived from `db.$transaction` rather than written as
 * `Prisma.TransactionClient`: this project's client carries extensions, and the
 * extended transaction client is not assignable to the generated type. Same
 * reasoning — and same shape — as `HandoverTxClient` in the custody service.
 */
type ReceiptTxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Ceiling on items produced by one receipt.
 *
 * `createAsset` runs per item — it generates a sequential id and a QR code each
 * time — so a line of `INDIVIDUAL` × 100,000 would be 100,000 round trips
 * inside one request. The cap turns that from a timeout into a clear message
 * telling the operator to use `BULK` tracking or split the receipt.
 */
export const MAX_ITEMS_PER_RECEIPT = 500;

/**
 * Private bucket holding receipt signature PNGs.
 *
 * Separate from `custody-signatures` even though both hold the same kind of
 * image: they have different retention and different access rules, and one
 * bucket holding two kinds of document is a bucket nobody can safely set a
 * policy on.
 */
export const RECEIPT_SIGNATURE_BUCKET = "goods-receipt-signatures";

/** How long a signature display URL stays valid, in seconds. */
const SIGNATURE_URL_TTL = 60 * 5;

/** Relations every receipt view needs. */
export const RECEIPT_INCLUDE = {
  lines: {
    orderBy: { lineNumber: "asc" },
    include: { _count: { select: { assets: true } } },
  },
  signatures: {
    select: {
      id: true,
      party: true,
      declaredName: true,
      signedAt: true,
      // The storage path, not the image. It is fed to `getSignatureUrls` to
      // mint a short-lived URL — the bucket is private and the path alone
      // grants nothing.
      signatureImagePath: true,
      signedByUser: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} as const;

/**
 * Builds the next workspace-scoped reference, e.g. `EPDA-RCV-2026-0042`.
 *
 * Reads the current maximum and adds one, which races if two operators submit
 * at the same instant. That is handled where it belongs: the
 * `(organizationId, reference)` unique index rejects the loser and
 * {@link createGoodsReceipt} retries. Locking a table to avoid a collision that
 * happens a few times a year would be the more expensive mistake.
 *
 * @param organizationId - Workspace the counter belongs to
 * @param tx - Transaction client, so the read happens inside the retry
 * @returns The next reference string
 */
async function nextReference(
  organizationId: string,
  tx: ReceiptTxClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `EPDA-RCV-${year}-`;

  const latest = await tx.goodsReceipt.findFirst({
    where: { organizationId, reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  const lastNumber = latest ? Number(latest.reference.slice(prefix.length)) : 0;
  const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;

  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * Removes fields that belong to the other form.
 *
 * The schema accepts every field from both forms because one request shape is
 * simpler than two. This is where the type actually decides: a `RECORD` cannot
 * carry a shipping-document number, and a `MEMO` cannot carry a purchase-request
 * number, no matter what a hand-crafted POST contains.
 *
 * Without this the extra fields would be silently persisted and then silently
 * printed by a future PDF template — a document showing references that were
 * never on the paper it claims to reproduce.
 *
 * @param input - The validated form body
 * @returns Only the header fields this form type owns
 */
function stripForeignFields(input: GoodsReceiptInput) {
  const shared = {
    fiscalYear: input.fiscalYear ?? null,
    entityName: input.entityName ?? null,
    entityNumber: input.entityNumber ?? null,
    warehouseName: input.warehouseName ?? null,
    pageCount: input.pageCount ?? null,
    receiptDate: input.receiptDate ?? null,
    supplier: input.supplier ?? null,
  };

  if (input.type === GoodsReceiptType.MEMO) {
    return {
      ...shared,
      purchaseOrderNumber: input.purchaseOrderNumber ?? null,
      purchaseOrderDate: input.purchaseOrderDate ?? null,
      shippingDocNumber: input.shippingDocNumber ?? null,
      shippingDocDate: input.shippingDocDate ?? null,
      inspectionRecordNumber: input.inspectionRecordNumber ?? null,
      inspectionRecordDate: input.inspectionRecordDate ?? null,
      provisionalNoticeNumber: input.provisionalNoticeNumber ?? null,
      provisionalNoticeDate: input.provisionalNoticeDate ?? null,
      purchaseRequestNumber: null,
      supportingDocName: null,
      supportingDocNumber: null,
      supportingDocDate: null,
    };
  }

  return {
    ...shared,
    purchaseOrderNumber: null,
    purchaseOrderDate: null,
    shippingDocNumber: null,
    shippingDocDate: null,
    inspectionRecordNumber: null,
    inspectionRecordDate: null,
    provisionalNoticeNumber: null,
    provisionalNoticeDate: null,
    purchaseRequestNumber: input.purchaseRequestNumber ?? null,
    supportingDocName: input.supportingDocName ?? null,
    supportingDocNumber: input.supportingDocNumber ?? null,
    supportingDocDate: input.supportingDocDate ?? null,
  };
}

/**
 * Computes the totals block from the lines.
 *
 * Always recomputed, never taken from the client — the totals row is the part
 * of a financial form most worth tampering with, and it is derivable, so there
 * is no reason to trust input for it.
 *
 * The two forms differ in what the totals mean, and that difference is real
 * rather than cosmetic:
 *
 * - **نموذج 2** prints قيمة إجمالية, then ضريبة, then اجمالي المبلغ. The line
 *   prices are pre-VAT and the VAT figure comes from the supplier's invoice.
 * - **نموذج 3** prints one VAT-inclusive figure, so the line prices already
 *   include it and a separate VAT column would double-count.
 *
 * @param input - The validated form body
 * @returns Subtotal, VAT and grand total in halalas
 */
export function computeTotals(input: GoodsReceiptInput): {
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
} {
  const subtotalHalalas = input.lines.reduce(
    (sum, line) => sum + lineTotal(line.unitPrice, line.quantity),
    0,
  );

  // نموذج 3's total is VAT-inclusive by definition, so any VAT the client sent
  // is discarded rather than added.
  const vatHalalas = getFormShape(input.type).hasSeparateVat
    ? input.vat ?? 0
    : 0;

  return {
    subtotalHalalas,
    vatHalalas,
    totalHalalas: subtotalHalalas + vatHalalas,
  };
}

/**
 * How many `Asset` rows a set of lines will produce.
 *
 * `INDIVIDUAL` lines produce one row per unit; `BULK` lines produce exactly
 * one. Computed before any write so an oversized receipt is refused up front
 * rather than half-created.
 *
 * @param lines - The validated lines
 * @returns Total item rows that would be created
 */
function countItemsToCreate(lines: ReceiptLineInput[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.tracking === "INDIVIDUAL" ? line.quantity : 1),
    0,
  );
}

/**
 * Creates a receipt and the items it admits.
 *
 * The receipt and its lines are written in a transaction; the items are created
 * **after** it commits. That split is deliberate: `createAsset` generates a
 * sequential id and a QR per item and can take seconds for a large receipt,
 * and holding a transaction open for that long blocks the sequential-id counter
 * for every other operator. The cost is that a mid-way failure leaves a saved
 * receipt with fewer items than lines — which is visible (each line reports its
 * item count) and fixable, unlike a lock-timeout storm.
 *
 * @param args.input - The validated form body
 * @param args.organizationId - Workspace the delivery belongs to
 * @param args.userId - The warehouse operator filling the form in
 * @returns The receipt with its lines, signatures and item counts
 * @throws {ShelfError} 400 when the receipt would produce too many items
 */
export async function createGoodsReceipt({
  input,
  organizationId,
  userId,
}: {
  input: GoodsReceiptInput;
  organizationId: string;
  userId: string;
}) {
  const itemCount = countItemsToCreate(input.lines);

  if (itemCount > MAX_ITEMS_PER_RECEIPT) {
    throw new ShelfError({
      cause: null,
      title: "النموذج كبير جداً",
      message: `هذا النموذج سينشئ ${itemCount} صنفاً، والحد الأقصى ${MAX_ITEMS_PER_RECEIPT}. استخدم تتبّعاً بالكمية للأسطر الكبيرة، أو وزّع الأصناف على أكثر من نموذج.`,
      additionalData: { itemCount, organizationId },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const totals = computeTotals(input);
  const header = stripForeignFields(input);
  const shape = getFormShape(input.type);

  let receipt: GoodsReceipt;

  try {
    receipt = await db.$transaction(async (tx) => {
      // Retry on reference collision: two operators submitting in the same
      // instant both read the same maximum. The unique index is the arbiter.
      let attempts = 0;

      for (;;) {
        try {
          return await tx.goodsReceipt.create({
            data: {
              ...header,
              type: input.type,
              // SAVED, not DRAFT: the items exist from here, so a state that
              // claims otherwise would be a lie the rest of the code reads.
              state: GoodsReceiptState.SAVED,
              savedAt: new Date(),
              reference: await nextReference(organizationId, tx),
              ...totals,
              organizationId,
              createdById: userId,
              lines: {
                create: input.lines.map((line, index) => ({
                  lineNumber: index + 1,
                  itemCode: line.itemCode ?? null,
                  name: line.name,
                  // نموذج 3 has no description column on paper; dropping it
                  // here keeps the record matching the form.
                  description: shape.hasDescription
                    ? line.description ?? null
                    : null,
                  unit: line.unit ?? null,
                  quantity: line.quantity,
                  unitPriceHalalas: line.unitPrice,
                  lineTotalHalalas: lineTotal(line.unitPrice, line.quantity),
                  notes: line.notes ?? null,
                  tracking: line.tracking,
                  itemCategory: line.itemCategory ?? null,
                  // Derived, never taken from the client: the classification
                  // decides accounting treatment, so it is computed from the
                  // category and the price the server just validated.
                  itemClass: classifyReceiptLine(line),
                })),
              },
            },
          });
        } catch (cause) {
          const isReferenceCollision =
            typeof cause === "object" &&
            cause !== null &&
            "code" in cause &&
            (cause as { code?: string }).code === "P2002";

          if (!isReferenceCollision || ++attempts >= 3) throw cause;
        }
      }
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "تعذّر حفظ نموذج الاستلام.",
      additionalData: { organizationId, type: input.type },
      label,
    });
  }

  await materializeReceiptItems({
    receiptId: receipt.id,
    organizationId,
    userId,
  });

  return getGoodsReceipt({ id: receipt.id, organizationId });
}

/**
 * Turns each saved line into `Asset` rows.
 *
 * Runs outside the receipt transaction — see {@link createGoodsReceipt} for
 * why. Lines that already produced items are skipped, so this is safe to call
 * again after a partial failure.
 *
 * Exported because "safe to call again" needs somewhere to be called *from*:
 * {@link signGoodsReceipt} runs it before promoting a document to SIGNED, and
 * the receipt page offers it as an explicit repair for a receipt that was
 * already signed when it came up short.
 *
 * @param args.receiptId - The saved receipt
 * @param args.organizationId - Workspace, for scoping every write
 * @param args.userId - Recorded as the creating user on each item
 * @returns How many items were created
 */
export async function materializeReceiptItems({
  receiptId,
  organizationId,
  userId,
}: {
  receiptId: string;
  organizationId: string;
  userId: string;
}): Promise<number> {
  const lines = await db.goodsReceiptLine.findMany({
    where: { receiptId, receipt: { organizationId } },
    orderBy: { lineNumber: "asc" },
    include: { _count: { select: { assets: true } } },
  });

  let created = 0;

  for (const line of lines) {
    // Idempotency: a retry after a partial failure must not double-create.
    if (line._count.assets > 0) continue;

    const shared = {
      description: line.description ?? "",
      categoryId: null,
      valuation: halalasToRiyals(line.unitPriceHalalas),
      organizationId,
      userId,
      // Every item enters at PENDING — invisible to employees until
      // المستودعات approves it. The receipt flow does not shortcut that.
      lifecycleStage: "PENDING" as const,
    };

    try {
      if (line.tracking === "BULK") {
        // One record holding the whole quantity.
        const asset = await createAsset({
          ...shared,
          title: line.name,
          type: AssetType.QUANTITY_TRACKED,
          quantity: line.quantity,
          unitOfMeasure: line.unit ?? undefined,
          // Required by createAsset for quantity-tracked rows. TWO_WAY is the
          // conservative default: it expects a return and produces a
          // consumption report, so nothing is silently written off. An
          // operator can change it on the asset afterwards.
          consumptionType: ConsumptionType.TWO_WAY,
        });

        await linkAssetToLine(asset.id, line, organizationId);
        created += 1;
        continue;
      }

      // One record per unit. Titles are suffixed so ten identical laptops are
      // distinguishable in a list before anyone has scanned their QR codes.
      for (let unit = 1; unit <= line.quantity; unit++) {
        const title =
          line.quantity > 1
            ? `${line.name} (${unit}/${line.quantity})`
            : line.name;

        const asset = await createAsset({
          ...shared,
          title,
          type: AssetType.INDIVIDUAL,
        });

        await linkAssetToLine(asset.id, line, organizationId);
        created += 1;
      }
    } catch (cause) {
      throw new ShelfError({
        cause,
        message: `تعذّر إنشاء أصناف السطر رقم ${line.lineNumber} (${line.name}).`,
        additionalData: { receiptId, lineId: line.id, organizationId },
        label,
      });
    }
  }

  return created;
}

/**
 * Attaches a freshly created item to its receipt line and mirrors the line's
 * classification onto it.
 *
 * A separate write because `createAsset` has no notion of receipts and giving
 * it one would push intake concerns into the general asset service. Scoped to
 * the organization so the update cannot reach across workspaces even though the
 * id was just produced locally.
 *
 * The class and category are **copied**, not read through the relation. A
 * correction to the line later must not silently reclassify items that المالية
 * have already coded — the item keeps the classification it was created under,
 * and changing it becomes a deliberate act on the item.
 *
 * @param assetId - The item just created
 * @param line - The line that admitted it, with its classification
 * @param organizationId - Workspace, for scoping
 */
async function linkAssetToLine(
  assetId: string,
  line: {
    id: string;
    itemClass: ItemClass | null;
    itemCategory: ItemCategory | null;
  },
  organizationId: string,
): Promise<void> {
  await db.asset.updateMany({
    where: { id: assetId, organizationId },
    data: {
      receiptLineId: line.id,
      itemClass: line.itemClass,
      itemCategory: line.itemCategory,
    },
  });
}

/**
 * Loads one receipt.
 *
 * @param args.id - Receipt id
 * @param args.organizationId - Workspace, applied in the `where` clause so a
 *   foreign id reads as "not found" rather than being fetched then checked
 * @returns The receipt with lines, signatures and item counts
 * @throws {ShelfError} 404 when it does not exist in this workspace
 */
export async function getGoodsReceipt({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  const receipt = await db.goodsReceipt.findFirst({
    where: { id, organizationId },
    include: RECEIPT_INCLUDE,
  });

  if (!receipt) {
    throw new ShelfError({
      cause: null,
      message: "نموذج الاستلام غير موجود.",
      additionalData: { id, organizationId },
      label,
      status: 404,
      shouldBeCaptured: false,
    });
  }

  return receipt;
}

/**
 * Lists receipts for the index page.
 *
 * @param args.organizationId - Workspace
 * @param args.page - 1-based page number
 * @param args.perPage - Page size
 * @param args.search - Matches reference, supplier or entity name
 * @param args.state - Optional state filter
 * @returns The page plus the total count
 */
export async function getGoodsReceipts({
  organizationId,
  page = 1,
  perPage = 25,
  search,
  state,
}: {
  organizationId: string;
  page?: number;
  perPage?: number;
  search?: string | null;
  state?: GoodsReceiptState | null;
}) {
  const where: Prisma.GoodsReceiptWhereInput = { organizationId };

  if (state) where.state = state;

  if (search) {
    where.OR = [
      { reference: { contains: search, mode: "insensitive" } },
      { supplier: { contains: search, mode: "insensitive" } },
      { entityName: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [receipts, totalItems] = await Promise.all([
      db.goodsReceipt.findMany({
        where,
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          _count: { select: { lines: true, signatures: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
      db.goodsReceipt.count({ where }),
    ]);

    return {
      receipts,
      totalItems,
      totalPages: Math.ceil(totalItems / perPage),
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "تعذّر تحميل نماذج الاستلام.",
      additionalData: { organizationId },
      label,
    });
  }
}

/**
 * Records a signature and promotes the receipt once all three land.
 *
 * `upsert` on `(receiptId, party)`: re-signing replaces rather than appends, so
 * a signatory who mis-typed their name can sign again without producing two
 * conflicting records for the same box on the form.
 *
 * @param args.receiptId - The receipt being signed
 * @param args.organizationId - Workspace, for scoping
 * @param args.party - Which of the three boxes
 * @param args.declaredName - Name as typed, snapshotted onto the record
 * @param args.signatureImagePath - Path inside the private signatures bucket
 * @param args.userId - Signing user, when they have an account
 * @param args.ipAddress - Captured for evidentiary value
 * @param args.userAgent - Same
 * @returns The updated receipt
 * @throws {ShelfError} 400 when the party does not belong to this form type,
 *   or the receipt is not in a signable state
 */
export async function signGoodsReceipt({
  receiptId,
  organizationId,
  party,
  declaredName,
  signatureImagePath,
  userId,
  ipAddress,
  userAgent,
}: {
  receiptId: string;
  organizationId: string;
  party: GoodsReceiptParty;
  declaredName: string;
  signatureImagePath: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const receipt = await getGoodsReceipt({ id: receiptId, organizationId });

  if (receipt.state === GoodsReceiptState.VOIDED) {
    throw new ShelfError({
      cause: null,
      message: "لا يمكن التوقيع على نموذج ملغى.",
      additionalData: { receiptId },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const expected = partiesForType(receipt.type);

  if (!expected.includes(party)) {
    // Not a missing feature — a signature in a box this form does not have.
    throw new ShelfError({
      cause: null,
      message: "صفة الموقّع لا تنتمي إلى هذا النموذج.",
      additionalData: { receiptId, party, type: receipt.type },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  try {
    await db.goodsReceiptSignature.upsert({
      // The compound unique is named in the schema, so Prisma keys the lookup
      // by that name rather than by the generated `receiptId_party`.
      where: {
        goods_receipt_signature_party_unique: { receiptId, party },
      },
      create: {
        receiptId,
        party,
        declaredName,
        signatureImagePath,
        signedByUserId: userId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
      update: {
        declaredName,
        signatureImagePath,
        signedByUserId: userId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        signedAt: new Date(),
      },
    });

    // Re-read rather than counting the local array: a concurrent signature from
    // another party would otherwise be missed and the receipt left unpromoted.
    const signatureCount = await db.goodsReceiptSignature.count({
      where: { receiptId },
    });

    if (signatureCount >= expected.length) {
      /**
       * Last chance to make the document true.
       *
       * Items are created after the receipt transaction commits (see
       * {@link createGoodsReceipt}), so a failure there leaves a saved receipt
       * holding fewer items than lines. That was described as "fixable" but
       * nothing actually fixed it, and a receipt in that state stayed short
       * forever — a delivery signed for on paper whose stock never entered
       * inventory. One such receipt exists in the development database.
       *
       * The call is idempotent (lines that already produced items are skipped),
       * so on the normal path it is a single indexed read and no writes. If it
       * throws, its own error surfaces — `isLikeShelfError` below re-throws
       * ShelfErrors untouched — and the receipt stays SAVED rather than being
       * promoted to a SIGNED document that under-reports what arrived.
       */
      const materializerId = receipt.createdById ?? userId;

      if (materializerId) {
        // Attributed to whoever filled the form in, not to the signatory: the
        // items were admitted by the receipt, and a signatory may be a third
        // party with no account at all.
        await materializeReceiptItems({
          receiptId,
          organizationId,
          userId: materializerId,
        });
      }

      await db.goodsReceipt.updateMany({
        where: {
          id: receiptId,
          organizationId,
          state: GoodsReceiptState.SAVED,
        },
        data: { state: GoodsReceiptState.SIGNED, signedAt: new Date() },
      });
    }
  } catch (cause) {
    if (isLikeShelfError(cause)) throw cause;

    throw new ShelfError({
      cause,
      message: "تعذّر حفظ التوقيع.",
      additionalData: { receiptId, party },
      label,
    });
  }

  return getGoodsReceipt({ id: receiptId, organizationId });
}

/**
 * Stores a drawn signature and records it against the receipt.
 *
 * The image is uploaded **before** the database write, because Supabase Storage
 * cannot take part in a Postgres transaction. A failure between the two leaves
 * an orphaned object in a private bucket — unreferenced and harmless — which is
 * the better of the two possible inconsistencies. The alternative is a
 * committed signature row pointing at an image that was never stored, which
 * makes a signed document unprintable.
 *
 * The path is deterministic (`org/receipt/party.png`) with `upsert`, so
 * re-signing overwrites the previous image rather than accumulating orphans for
 * the same box.
 *
 * @param args.receiptId - Receipt being signed
 * @param args.organizationId - Workspace, re-checked so a guessed id reads as 404
 * @param args.party - Which of the three boxes
 * @param args.declaredName - Name as typed, snapshotted onto the record
 * @param args.signatureDataUrl - `data:image/png;base64,...` from the pad
 * @param args.userId - Signing user, when they have an account
 * @param args.ipAddress - Captured for evidentiary value
 * @param args.userAgent - Same
 * @returns The updated receipt
 * @throws {ShelfError} 400 for an invalid image or a party the form lacks
 */
export async function storeReceiptSignature({
  receiptId,
  organizationId,
  party,
  declaredName,
  signatureDataUrl,
  userId,
  ipAddress,
  userAgent,
}: {
  receiptId: string;
  organizationId: string;
  party: GoodsReceiptParty;
  declaredName: string;
  signatureDataUrl: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  // Validates existence, workspace and party before touching storage — an
  // upload for a receipt the caller cannot reach should never happen at all.
  const receipt = await getGoodsReceipt({ id: receiptId, organizationId });

  if (!partiesForType(receipt.type).includes(party)) {
    throw new ShelfError({
      cause: null,
      message: "صفة الموقّع لا تنتمي إلى هذا النموذج.",
      additionalData: { receiptId, party, type: receipt.type },
      label,
      status: 400,
      shouldBeCaptured: false,
    });
  }

  const bytes = decodeSignatureDataUrl(signatureDataUrl);
  const imagePath = `${organizationId}/${receiptId}/${party.toLowerCase()}.png`;

  const { error: uploadError } = await getSupabaseAdmin()
    .storage.from(RECEIPT_SIGNATURE_BUCKET)
    .upload(imagePath, bytes, { contentType: "image/png", upsert: true });

  if (uploadError) {
    /**
     * A missing bucket is the overwhelmingly likely cause on a fresh
     * environment, and "try again" is useless advice for it — retrying a
     * request that has nowhere to write fails identically forever.
     *
     * `supabase/seed.sql` declares the bucket, but that file only runs on
     * `supabase db reset`; an environment created before the bucket was added
     * never gets it. Naming the bucket turns a ten-minute hunt into a one-line
     * fix, so it is worth the slightly longer message.
     */
    const looksMissing = /not.?found|does not exist|no such bucket/i.test(
      uploadError.message ?? "",
    );

    throw new ShelfError({
      cause: uploadError,
      message: looksMissing
        ? `تعذّر حفظ التوقيع: حاوية التخزين «${RECEIPT_SIGNATURE_BUCKET}» غير موجودة. أنشئها بتشغيل supabase/seed.sql أو عبر لوحة Supabase (حاوية خاصة).`
        : "تعذّر حفظ صورة التوقيع. حاول مرة أخرى.",
      additionalData: {
        receiptId,
        party,
        imagePath,
        bucket: RECEIPT_SIGNATURE_BUCKET,
      },
      label: "File storage",
    });
  }

  return signGoodsReceipt({
    receiptId,
    organizationId,
    party,
    declaredName,
    signatureImagePath: imagePath,
    userId,
    ipAddress,
    userAgent,
  });
}

/**
 * Short-lived display URLs for a receipt's signature images.
 *
 * Signatures are personal data and the bucket is private, so they are never
 * served by a stable public URL. Each request mints URLs that expire in
 * minutes.
 *
 * Failures are swallowed per-party: one unreadable image should leave the other
 * two visible rather than blanking the whole signature block.
 *
 * @param signatures - Party and stored path for each signature
 * @returns Party → signed URL, omitting any that could not be signed
 */
export async function getSignatureUrls(
  signatures: Array<{ party: GoodsReceiptParty; signatureImagePath: string }>,
): Promise<Partial<Record<GoodsReceiptParty, string>>> {
  const storage = getSupabaseAdmin().storage.from(RECEIPT_SIGNATURE_BUCKET);

  const entries = await Promise.all(
    signatures.map(async (signature) => {
      const { data } = await storage
        .createSignedUrl(signature.signatureImagePath, SIGNATURE_URL_TTL)
        .catch(() => ({ data: null }));

      return [signature.party, data?.signedUrl] as const;
    }),
  );

  return Object.fromEntries(
    entries.filter((entry): entry is [GoodsReceiptParty, string] =>
      Boolean(entry[1]),
    ),
  );
}

/**
 * Voids a receipt.
 *
 * The document is kept, not deleted, so a cancelled delivery stays in the
 * record. The items it created are **not** touched: stock that physically
 * arrived does not stop existing because the paperwork was cancelled, and
 * deleting it here would be this function silently disposing of inventory. An
 * operator removes the items separately if they were never received.
 *
 * @param args.id - Receipt id
 * @param args.organizationId - Workspace, for scoping
 * @returns The voided receipt
 * @throws {ShelfError} 404 if it does not exist here
 */
export async function voidGoodsReceipt({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  await getGoodsReceipt({ id, organizationId });

  await db.goodsReceipt.updateMany({
    where: { id, organizationId },
    data: { state: GoodsReceiptState.VOIDED },
  });

  return getGoodsReceipt({ id, organizationId });
}
