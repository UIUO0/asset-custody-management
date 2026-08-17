-- Drop schema objects nothing reads any more.
--
-- Verified against the live database before writing this: all three columns
-- held zero non-null values, so no data is lost.
--
--   User.lastMobileActiveAt (+ its index) — residue of the companion mobile
--     app, deleted 2026-08-06. Its own schema comment described it as written
--     by `requireMobileAuth`, a function that no longer exists.
--   Image.altText            — never read or written anywhere in the app.
--   AuditAssignment.role + AuditAssignmentRole — the enum name appears in no
--     source file; the column was always null.
--   TagUseFor                — orphaned when the Tag model was dropped
--     (20260811120000_drop_kits_and_tags).
--
-- ⚠️ Deliberately NOT dropped here, so a future regeneration does not sweep
-- them in: `BookingStatus` / `BookingApprovalState` (a parallel change owns
-- the booking teardown) and the Stripe `Tier` / `TierLimit` surface, which
-- still gates features that are in use (audits, barcodes).

-- DropIndex
DROP INDEX "User_lastMobileActiveAt_idx";

-- AlterTable
ALTER TABLE "AuditAssignment" DROP COLUMN "role";

-- AlterTable
ALTER TABLE "Image" DROP COLUMN "altText";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "lastMobileActiveAt";

-- DropEnum
DROP TYPE "AuditAssignmentRole";

-- DropEnum
DROP TYPE "TagUseFor";
