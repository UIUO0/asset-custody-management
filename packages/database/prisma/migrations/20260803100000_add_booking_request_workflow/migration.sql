-- EPDA: booking request workflow (مسار الطلبات).
--
-- A booking raised by an ordinary employee becomes a *request* that المستودعات
-- accept or reject, and that المخزون can freeze for review. Modelled next to
-- "BookingStatus" rather than inside it: "status" is switched on exhaustively
-- across the codebase, so widening it would change every one of those flows.

CREATE TYPE "BookingApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Booking"
  ADD COLUMN "approvalState" "BookingApprovalState" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "approvalDecidedAt" TIMESTAMPTZ(3),
  ADD COLUMN "approvalDecidedById" TEXT,
  ADD COLUMN "approvalNote" TEXT,
  ADD COLUMN "reviewHoldAt" TIMESTAMPTZ(3),
  ADD COLUMN "reviewHoldById" TEXT,
  ADD COLUMN "reviewHoldReason" TEXT;

-- Every existing booking was created under the old rule, where creating a
-- booking *was* the approval. Backfilling them to APPROVED preserves that;
-- leaving them PENDING would retroactively suspend the entire live schedule,
-- including bookings already checked out.
UPDATE "Booking" SET "approvalState" = 'APPROVED';

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_approvalDecidedById_fkey"
    FOREIGN KEY ("approvalDecidedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Booking_reviewHoldById_fkey"
    FOREIGN KEY ("reviewHoldById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Booking_approvalDecidedById_idx" ON "Booking"("approvalDecidedById");
CREATE INDEX "Booking_reviewHoldById_idx" ON "Booking"("reviewHoldById");

-- Drives the requests queue: "pending requests in this workspace".
CREATE INDEX "Booking_organizationId_approvalState_idx"
  ON "Booking"("organizationId", "approvalState");
