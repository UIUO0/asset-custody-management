/*
  Warnings:

  - You are about to drop the column `bookingAssetId` on the `ConsumptionLog` table. All the data in the column will be lost.
  - You are about to drop the column `bookingId` on the `ConsumptionLog` table. All the data in the column will be lost.
  - You are about to drop the `Booking` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BookingAsset` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BookingModelRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BookingNote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BookingSettings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MobileAuthCode` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PartialBookingCheckin` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PartialBookingCheckout` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_BookingNotificationRecipients` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_BookingSettingsAlwaysNotify` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_approvalDecidedById_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_custodianTeamMemberId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_custodianUserId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_reviewHoldById_fkey";

-- DropForeignKey
ALTER TABLE "BookingAsset" DROP CONSTRAINT "BookingAsset_assetId_fkey";

-- DropForeignKey
ALTER TABLE "BookingAsset" DROP CONSTRAINT "BookingAsset_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "BookingModelRequest" DROP CONSTRAINT "BookingModelRequest_assetModelId_fkey";

-- DropForeignKey
ALTER TABLE "BookingModelRequest" DROP CONSTRAINT "BookingModelRequest_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "BookingNote" DROP CONSTRAINT "BookingNote_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "BookingNote" DROP CONSTRAINT "BookingNote_userId_fkey";

-- DropForeignKey
ALTER TABLE "BookingSettings" DROP CONSTRAINT "BookingSettings_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ConsumptionLog" DROP CONSTRAINT "ConsumptionLog_bookingAssetId_fkey";

-- DropForeignKey
ALTER TABLE "ConsumptionLog" DROP CONSTRAINT "ConsumptionLog_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "MobileAuthCode" DROP CONSTRAINT "MobileAuthCode_userId_fkey";

-- DropForeignKey
ALTER TABLE "PartialBookingCheckin" DROP CONSTRAINT "PartialBookingCheckin_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "PartialBookingCheckin" DROP CONSTRAINT "PartialBookingCheckin_checkedInById_fkey";

-- DropForeignKey
ALTER TABLE "PartialBookingCheckout" DROP CONSTRAINT "PartialBookingCheckout_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "PartialBookingCheckout" DROP CONSTRAINT "PartialBookingCheckout_checkedOutById_fkey";

-- DropForeignKey
ALTER TABLE "_BookingNotificationRecipients" DROP CONSTRAINT "_BookingNotificationRecipients_A_fkey";

-- DropForeignKey
ALTER TABLE "_BookingNotificationRecipients" DROP CONSTRAINT "_BookingNotificationRecipients_B_fkey";

-- DropForeignKey
ALTER TABLE "_BookingSettingsAlwaysNotify" DROP CONSTRAINT "_BookingSettingsAlwaysNotify_A_fkey";

-- DropForeignKey
ALTER TABLE "_BookingSettingsAlwaysNotify" DROP CONSTRAINT "_BookingSettingsAlwaysNotify_B_fkey";

-- DropIndex
DROP INDEX "ConsumptionLog_bookingAssetId_idx";

-- DropIndex
DROP INDEX "ConsumptionLog_bookingId_idx";

-- AlterTable
ALTER TABLE "ConsumptionLog" DROP COLUMN "bookingAssetId",
DROP COLUMN "bookingId";

-- DropTable
DROP TABLE "Booking";

-- DropTable
DROP TABLE "BookingAsset";

-- DropTable
DROP TABLE "BookingModelRequest";

-- DropTable
DROP TABLE "BookingNote";

-- DropTable
DROP TABLE "BookingSettings";

-- DropTable
DROP TABLE "MobileAuthCode";

-- DropTable
DROP TABLE "PartialBookingCheckin";

-- DropTable
DROP TABLE "PartialBookingCheckout";

-- DropTable
DROP TABLE "_BookingNotificationRecipients";

-- DropTable
DROP TABLE "_BookingSettingsAlwaysNotify";
