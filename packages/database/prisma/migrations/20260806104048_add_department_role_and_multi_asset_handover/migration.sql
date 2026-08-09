-- EPDA: departments receive stock in bulk, and a محضر covers a whole batch.
--
-- Two changes, deliberately in one migration because the second one moves data:
--
--   1. `DEPARTMENT` role + `TeamMember.isDepartment` +
--      `UserOrganization.departmentTeamMemberId`. The role says "may act as a
--      department"; the pointer says "which one". Keeping them apart is what
--      lets a third department be a row rather than a code change.
--
--   2. `CustodyHandover.assetId` (one asset per محضر) becomes the
--      `CustodyHandoverAsset` pivot (N assets per محضر), because the warehouse
--      hands a whole purchase order to a department as ONE signed document.
--
-- ORDER MATTERS: the pivot is created and BACKFILLED before `assetId` is
-- dropped. Prisma's generated diff dropped the column first, which would have
-- discarded the asset link of every existing محضر. Do not reorder.

-- AlterEnum
ALTER TYPE "OrganizationRoles" ADD VALUE 'DEPARTMENT';

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "isDepartment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserOrganization" ADD COLUMN     "departmentTeamMemberId" TEXT;

-- CreateIndex
CREATE INDEX "UserOrganization_departmentTeamMemberId_idx" ON "UserOrganization"("departmentTeamMemberId");

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_departmentTeamMemberId_fkey" FOREIGN KEY ("departmentTeamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CustodyHandoverAsset" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyHandoverAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustodyHandoverAsset_asset_idx" ON "CustodyHandoverAsset"("assetId");

-- CreateIndex
CREATE INDEX "CustodyHandoverAsset_handoverId_idx" ON "CustodyHandoverAsset"("handoverId");

-- CreateIndex
CREATE UNIQUE INDEX "CustodyHandoverAsset_handoverId_assetId_key" ON "CustodyHandoverAsset"("handoverId", "assetId");

-- AddForeignKey
ALTER TABLE "CustodyHandoverAsset" ADD CONSTRAINT "CustodyHandoverAsset_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "CustodyHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyHandoverAsset" ADD CONSTRAINT "CustodyHandoverAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing محضر becomes a one-line محضر. `createdAt` is copied
-- from the parent so the line is not newer than the document that carries it.
INSERT INTO "CustodyHandoverAsset" ("id", "handoverId", "assetId", "createdAt")
SELECT gen_random_uuid()::text, "id", "assetId", "createdAt"
FROM "CustodyHandover";

-- DropForeignKey
ALTER TABLE "CustodyHandover" DROP CONSTRAINT "CustodyHandover_assetId_fkey";

-- DropIndex
-- Replaced by `CustodyHandoverAsset_asset_idx`; `kind` and `state` now come
-- from the join to `CustodyHandover`.
DROP INDEX "CustodyHandover_asset_kind_state_idx";

-- AlterTable
ALTER TABLE "CustodyHandover" DROP COLUMN "assetId";
