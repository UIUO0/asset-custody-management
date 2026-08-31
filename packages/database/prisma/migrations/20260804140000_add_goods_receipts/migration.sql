-- ORG: goods receipts (مذكرة استلام / محضر استلام).
--
-- Stock now enters the system only through one of the authority's two official
-- intake forms. This migration adds the document, its item lines, and its three
-- signatures, plus the two columns on "Asset" that tie an item back to the line
-- that admitted it.
--
-- Purely additive. Existing assets get `receiptLineId = NULL` and
-- `itemClass = NULL`, which is the correct reading: they predate the receipt
-- flow and were never classified. No row is rewritten, so this is safe to apply
-- to a live database.

CREATE TYPE "GoodsReceiptType" AS ENUM ('MEMO', 'RECORD');
CREATE TYPE "GoodsReceiptState" AS ENUM ('DRAFT', 'SAVED', 'SIGNED', 'VOIDED');
CREATE TYPE "GoodsReceiptLineTracking" AS ENUM ('INDIVIDUAL', 'BULK');

-- Six parties, not three: both forms take three signatures but name them
-- differently, and a printed محضر has to match the paper.
CREATE TYPE "GoodsReceiptParty" AS ENUM (
  'YARD_CUSTODIAN', 'WAREHOUSE_KEEPER', 'WAREHOUSE_HEAD',
  'RECEIVER', 'TECHNICAL_MEMBER', 'RESPONSIBLE_HEAD'
);

-- أصل / مادة. No rows are populated yet — the authority's classification rules
-- are still being written, so the column stays NULL until they land.
CREATE TYPE "ItemClass" AS ENUM ('ASSET', 'MATERIAL');

-- ── GoodsReceipt ──────────────────────────────────────────────────────────
--
-- Money is INTEGER halalas throughout, never a float: a receipt is an
-- accounting document and its total must not be able to drift from the paper it
-- was copied from. The ريال/هللة columns on the form are two views of one
-- integer.
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "type" "GoodsReceiptType" NOT NULL,
    "state" "GoodsReceiptState" NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT NOT NULL,
    "fiscalYear" TEXT,

    -- ترويسة النموذج
    "entityName" TEXT,
    "entityNumber" TEXT,
    "warehouseName" TEXT,
    "pageCount" INTEGER,
    "receiptDate" TIMESTAMPTZ(3),
    "supplier" TEXT,

    -- مراجع نموذج 2 (مذكرة استلام)
    "purchaseOrderNumber" TEXT,
    "purchaseOrderDate" TIMESTAMPTZ(3),
    "shippingDocNumber" TEXT,
    "shippingDocDate" TIMESTAMPTZ(3),
    "inspectionRecordNumber" TEXT,
    "inspectionRecordDate" TIMESTAMPTZ(3),
    "provisionalNoticeNumber" TEXT,
    "provisionalNoticeDate" TIMESTAMPTZ(3),

    -- مراجع نموذج 3 (محضر استلام)
    "purchaseRequestNumber" TEXT,
    "supportingDocName" TEXT,
    "supportingDocNumber" TEXT,
    "supportingDocDate" TIMESTAMPTZ(3),

    -- المجاميع (هللات)
    "subtotalHalalas" INTEGER NOT NULL DEFAULT 0,
    "vatHalalas" INTEGER NOT NULL DEFAULT 0,
    "totalHalalas" INTEGER NOT NULL DEFAULT 0,

    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "savedAt" TIMESTAMPTZ(3),
    "signedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- Per workspace, not global: two authorities on one instance each start at 1.
-- This index is also what makes the reference-collision retry in
-- `createGoodsReceipt` correct rather than merely lucky.
CREATE UNIQUE INDEX "GoodsReceipt_organizationId_reference_key"
  ON "GoodsReceipt"("organizationId", "reference");
CREATE INDEX "GoodsReceipt_organizationId_state_idx"
  ON "GoodsReceipt"("organizationId", "state");
CREATE INDEX "GoodsReceipt_createdById_idx" ON "GoodsReceipt"("createdById");

ALTER TABLE "GoodsReceipt"
  ADD CONSTRAINT "GoodsReceipt_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- SetNull: the document outlives the staff account that produced it.
  ADD CONSTRAINT "GoodsReceipt_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── GoodsReceiptLine ──────────────────────────────────────────────────────
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemCode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceHalalas" INTEGER NOT NULL DEFAULT 0,
    "lineTotalHalalas" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "tracking" "GoodsReceiptLineTracking" NOT NULL DEFAULT 'INDIVIDUAL',
    "itemClass" "ItemClass",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoodsReceiptLine_receiptId_lineNumber_key"
  ON "GoodsReceiptLine"("receiptId", "lineNumber");
CREATE INDEX "GoodsReceiptLine_receiptId_idx" ON "GoodsReceiptLine"("receiptId");

ALTER TABLE "GoodsReceiptLine"
  ADD CONSTRAINT "GoodsReceiptLine_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── GoodsReceiptSignature ─────────────────────────────────────────────────
--
-- Deliberately shaped like "CustodyHandoverSignature": snapshotted name,
-- private-bucket image path, evidentiary IP/UA.
CREATE TABLE "GoodsReceiptSignature" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "party" "GoodsReceiptParty" NOT NULL,
    "signedByUserId" TEXT,
    "declaredName" TEXT NOT NULL,
    "signatureImagePath" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceiptSignature_pkey" PRIMARY KEY ("id")
);

-- One signature per party per receipt: re-signing replaces, never appends.
CREATE UNIQUE INDEX "GoodsReceiptSignature_receiptId_party_key"
  ON "GoodsReceiptSignature"("receiptId", "party");
CREATE INDEX "GoodsReceiptSignature_signedByUserId_idx"
  ON "GoodsReceiptSignature"("signedByUserId");

ALTER TABLE "GoodsReceiptSignature"
  ADD CONSTRAINT "GoodsReceiptSignature_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GoodsReceiptSignature_signedByUserId_fkey"
    FOREIGN KEY ("signedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Asset linkage ─────────────────────────────────────────────────────────
--
-- SetNull, not Cascade: voiding a receipt must never delete stock that
-- physically sits on a shelf.
ALTER TABLE "Asset"
  ADD COLUMN "receiptLineId" TEXT,
  ADD COLUMN "itemClass" "ItemClass";

CREATE INDEX "Asset_receiptLineId_idx" ON "Asset"("receiptLineId");

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_receiptLineId_fkey"
    FOREIGN KEY ("receiptLineId") REFERENCES "GoodsReceiptLine"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
