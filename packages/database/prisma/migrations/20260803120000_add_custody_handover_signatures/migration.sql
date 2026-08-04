-- EPDA: محاضر التسليم والاسترجاع الموقّعة (signed custody handover records)
--
-- Adds an immutable audit artefact that gates every custody change: no asset
-- moves into or out of an employee's hands without both parties signing.
--
-- Migration posture, matching the two EPDA workflows that came before
-- (asset intake, booking requests): EXISTING ROWS ARE LEFT ALONE. Custody rows
-- created before this migration have no handover record and are not
-- back-filled with a synthetic one — a fabricated "محضر" nobody signed would
-- be worse than an honest gap. The service layer only requires a completed
-- record for *new* transitions, so the existing register keeps working and
-- fills in naturally as assets are returned.

-- CreateEnum
CREATE TYPE "CustodyHandoverKind" AS ENUM ('HANDOVER', 'RETURN');

-- CreateEnum
CREATE TYPE "CustodyHandoverState" AS ENUM ('AWAITING_SIGNATURES', 'COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "CustodyHandoverParty" AS ENUM ('RELEASING', 'RECEIVING');

-- CreateTable
CREATE TABLE "CustodyHandover" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "CustodyHandoverKind" NOT NULL,
    "state" "CustodyHandoverState" NOT NULL DEFAULT 'AWAITING_SIGNATURES',
    "assetId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "counterpartyTeamMemberId" TEXT NOT NULL,
    "operatorUserId" TEXT,
    "conditionNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "voidedReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustodyHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyHandoverSignature" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "party" "CustodyHandoverParty" NOT NULL,
    "signedByUserId" TEXT,
    "declaredName" TEXT NOT NULL,
    "signatureImagePath" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyHandoverSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Workspace-scoped reference numbers: "EPDA-HO-2026-0042" may repeat across
-- workspaces but never within one, so a reissued PDF always resolves to one
-- record.
CREATE UNIQUE INDEX "CustodyHandover_organizationId_reference_key"
    ON "CustodyHandover"("organizationId", "reference");

-- CreateIndex
-- Serves the gate on the hot path of every custody change:
--   "is there a COMPLETED record of this kind for this asset?"
CREATE INDEX "CustodyHandover_asset_kind_state_idx"
    ON "CustodyHandover"("assetId", "kind", "state");

-- CreateIndex
CREATE INDEX "CustodyHandover_org_createdAt_idx"
    ON "CustodyHandover"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CustodyHandover_counterpartyTeamMemberId_idx"
    ON "CustodyHandover"("counterpartyTeamMemberId");

-- CreateIndex
CREATE INDEX "CustodyHandover_operatorUserId_idx"
    ON "CustodyHandover"("operatorUserId");

-- CreateIndex
-- One signature per side, enforced by the database rather than by application
-- convention: a double-submit or a replayed request cannot overwrite a
-- signature that already landed.
CREATE UNIQUE INDEX "CustodyHandoverSignature_handoverId_party_key"
    ON "CustodyHandoverSignature"("handoverId", "party");

-- CreateIndex
CREATE INDEX "CustodyHandoverSignature_signedByUserId_idx"
    ON "CustodyHandoverSignature"("signedByUserId");

-- AddForeignKey
ALTER TABLE "CustodyHandover" ADD CONSTRAINT "CustodyHandover_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyHandover" ADD CONSTRAINT "CustodyHandover_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyHandover" ADD CONSTRAINT "CustodyHandover_counterpartyTeamMemberId_fkey"
    FOREIGN KEY ("counterpartyTeamMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, not CASCADE: the محضر must outlive the staff account that produced
-- it. Deleting an operator must never delete the evidence they signed.
ALTER TABLE "CustodyHandover" ADD CONSTRAINT "CustodyHandover_operatorUserId_fkey"
    FOREIGN KEY ("operatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyHandoverSignature" ADD CONSTRAINT "CustodyHandoverSignature_handoverId_fkey"
    FOREIGN KEY ("handoverId") REFERENCES "CustodyHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyHandoverSignature" ADD CONSTRAINT "CustodyHandoverSignature_signedByUserId_fkey"
    FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
