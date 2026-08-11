-- Drop the Kit and Tag subsystems.
--
-- Project-owner decision (2026-08-11): EPDA does not group assets into kits
-- and does not tag them. Both features are removed from the product, so the
-- tables, columns, join tables and the `KitStatus` enum go with them.
--
-- Two things this migration deliberately does NOT do, both of them traps a
-- regenerated version of this file will try to re-introduce:
--
--   1. It does not drop `ConsumptionLog_bookingAssetId_fkey`. That FK exists
--      in the database but is intentionally undeclared in `schema.prisma`, so
--      Prisma reads it as drift and emits a DROP for it in every migration it
--      generates. It has nothing to do with kits. The line was removed by
--      hand; remove it again if you regenerate.
--
--   2. It does not drop `ASSET_KIT_CHANGED` / `ASSET_TAGS_CHANGED` from
--      `ActivityAction`, nor `KIT` from `ActivityEntityType`. Those values are
--      historical: activity rows written before this migration still carry
--      them, and an enum value cannot be dropped while any row references it.
--      Only `KIT_CREATED` / `KIT_UPDATED` are removed, and only because zero
--      rows use them (verified against the live database before applying).
--
-- The two partial unique indexes on `Custody` and `AssetLocation` collapse
-- back into plain uniques here. Postgres drops the partial versions
-- automatically when `kitCustodyId` / `assetKitId` disappear, because their
-- WHERE predicates reference those columns — which is why the CREATE UNIQUE
-- INDEX statements at the bottom can reuse the same names.

-- AlterEnum
BEGIN;
CREATE TYPE "ActivityAction_new" AS ENUM ('ASSET_CREATED', 'ASSET_NAME_CHANGED', 'ASSET_DESCRIPTION_CHANGED', 'ASSET_CATEGORY_CHANGED', 'ASSET_KIT_CHANGED', 'ASSET_LOCATION_CHANGED', 'ASSET_TAGS_CHANGED', 'ASSET_STATUS_CHANGED', 'ASSET_VALUATION_CHANGED', 'ASSET_CUSTOM_FIELD_CHANGED', 'ASSET_PREFERRED_BARCODE_CHANGED', 'ASSET_ARCHIVED', 'ASSET_DELETED', 'CUSTODY_ASSIGNED', 'CUSTODY_RELEASED', 'BOOKING_CREATED', 'BOOKING_STATUS_CHANGED', 'BOOKING_DATES_CHANGED', 'BOOKING_ASSETS_ADDED', 'BOOKING_ASSETS_REMOVED', 'BOOKING_CHECKED_OUT', 'BOOKING_CHECKED_IN', 'BOOKING_PARTIAL_CHECKIN', 'BOOKING_PARTIAL_CHECKOUT', 'BOOKING_CANCELLED', 'BOOKING_ARCHIVED', 'AUDIT_CREATED', 'AUDIT_STARTED', 'AUDIT_ASSETS_ADDED', 'AUDIT_ASSETS_REMOVED', 'AUDIT_ASSET_SCANNED', 'AUDIT_ASSET_SCAN_REMOVED', 'AUDIT_DUE_DATE_CHANGED', 'AUDIT_ASSIGNEE_ADDED', 'AUDIT_ASSIGNEE_REMOVED', 'AUDIT_UPDATED', 'AUDIT_COMPLETED', 'AUDIT_CANCELLED', 'AUDIT_ARCHIVED', 'LOCATION_CREATED', 'LOCATION_UPDATED', 'ORGANIZATION_QR_ID_DISPLAY_PREFERENCE_CHANGED');
ALTER TABLE "ActivityEvent" ALTER COLUMN "action" TYPE "ActivityAction_new" USING ("action"::text::"ActivityAction_new");
ALTER TYPE "ActivityAction" RENAME TO "ActivityAction_old";
ALTER TYPE "ActivityAction_new" RENAME TO "ActivityAction";
DROP TYPE "public"."ActivityAction_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AssetKit" DROP CONSTRAINT "AssetKit_assetId_fkey";

-- DropForeignKey
ALTER TABLE "AssetKit" DROP CONSTRAINT "AssetKit_kitId_fkey";

-- DropForeignKey
ALTER TABLE "AssetKit" DROP CONSTRAINT "AssetKit_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "AssetLocation" DROP CONSTRAINT "AssetLocation_assetKitId_fkey";

-- DropForeignKey
ALTER TABLE "Barcode" DROP CONSTRAINT "Barcode_kitId_fkey";

-- DropForeignKey
ALTER TABLE "BookingAsset" DROP CONSTRAINT "BookingAsset_assetKitId_fkey";
-- DropForeignKey
ALTER TABLE "Custody" DROP CONSTRAINT "Custody_kitCustodyId_fkey";

-- DropForeignKey
ALTER TABLE "Kit" DROP CONSTRAINT "Kit_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Kit" DROP CONSTRAINT "Kit_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Kit" DROP CONSTRAINT "Kit_locationId_fkey";

-- DropForeignKey
ALTER TABLE "Kit" DROP CONSTRAINT "Kit_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "KitCustody" DROP CONSTRAINT "KitCustody_custodianId_fkey";

-- DropForeignKey
ALTER TABLE "KitCustody" DROP CONSTRAINT "KitCustody_kitId_fkey";

-- DropForeignKey
ALTER TABLE "Qr" DROP CONSTRAINT "Qr_kitId_fkey";

-- DropForeignKey
ALTER TABLE "ReportFound" DROP CONSTRAINT "ReportFound_kitId_fkey";

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT "Tag_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT "Tag_userId_fkey";

-- DropForeignKey
ALTER TABLE "_AssetToTag" DROP CONSTRAINT "_AssetToTag_A_fkey";

-- DropForeignKey
ALTER TABLE "_AssetToTag" DROP CONSTRAINT "_AssetToTag_B_fkey";

-- DropForeignKey
ALTER TABLE "_BookingToTag" DROP CONSTRAINT "_BookingToTag_A_fkey";

-- DropForeignKey
ALTER TABLE "_BookingToTag" DROP CONSTRAINT "_BookingToTag_B_fkey";

-- DropIndex
DROP INDEX "AssetLocation_assetKitId_idx";

-- DropIndex
DROP INDEX "Barcode_kitId_idx";

-- DropIndex
DROP INDEX "BookingAsset_assetKitId_idx";

-- DropIndex
DROP INDEX "Custody_assetId_teamMemberId_idx";

-- DropIndex
DROP INDEX "Custody_kitCustodyId_idx";

-- DropIndex
DROP INDEX "Qr_kitId_idx";

-- DropIndex
DROP INDEX "ReportFound_kitId_idx";

-- AlterTable
ALTER TABLE "ActivityEvent" DROP COLUMN "kitId";

-- AlterTable
ALTER TABLE "AssetLocation" DROP COLUMN "assetKitId";

-- AlterTable
ALTER TABLE "Barcode" DROP COLUMN "kitId";

-- AlterTable
ALTER TABLE "BookingAsset" DROP COLUMN "assetKitId";

-- AlterTable
ALTER TABLE "BookingSettings" DROP COLUMN "countKitsAsSingleUnit",
DROP COLUMN "tagsRequired";

-- AlterTable
ALTER TABLE "Custody" DROP COLUMN "kitCustodyId";

-- AlterTable
ALTER TABLE "Qr" DROP COLUMN "kitId";

-- AlterTable
ALTER TABLE "ReportFound" DROP COLUMN "kitId";

-- DropTable
DROP TABLE "AssetKit";

-- DropTable
DROP TABLE "Kit";

-- DropTable
DROP TABLE "KitCustody";

-- DropTable
DROP TABLE "Tag";

-- DropTable
DROP TABLE "_AssetToTag";

-- DropTable
DROP TABLE "_BookingToTag";

-- DropEnum
DROP TYPE "KitStatus";

-- CreateIndex
CREATE UNIQUE INDEX "AssetLocation_manual_unique" ON "AssetLocation"("assetId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Custody_operator_unique" ON "Custody"("assetId", "teamMemberId");

