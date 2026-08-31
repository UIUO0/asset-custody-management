-- ORG: سبب طلب الاسترجاع (why the custodian asked to hand the asset back)
--
-- Kept separate from `conditionNotes` on purpose. "الجهاز يسخن" and "خدش في
-- الغطاء الخلفي" are different facts: one is why the asset is coming back, the
-- other is what state it is in. A warehouse triaging the return queue reads
-- them for different reasons, and collapsing them into one box loses that.
--
-- Nullable: warehouse-initiated handovers have no requester to supply one.
-- Mandatory for employee-initiated returns, enforced in `openReturnRequest`
-- rather than by a NOT NULL constraint — the same posture as the mandatory
-- rejection reason on booking requests, and the reason existing rows need no
-- backfill.

ALTER TABLE "CustodyHandover" ADD COLUMN "requestReason" TEXT;
