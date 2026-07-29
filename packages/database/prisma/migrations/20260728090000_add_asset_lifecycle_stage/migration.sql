-- EPDA: asset intake workflow stage (قيد الانتظار / جاهز للتوزيع).
--
-- Separate from "AssetStatus", which is derived from custody and bookings.
-- New assets start at PENDING and only become visible to ordinary employees
-- once المستودعات approves them, after المالية has added the financial coding.

CREATE TYPE "AssetLifecycleStage" AS ENUM ('PENDING', 'READY');

-- New rows default to PENDING (the workflow's entry point).
ALTER TABLE "Asset"
  ADD COLUMN "lifecycleStage" "AssetLifecycleStage" NOT NULL DEFAULT 'PENDING';

-- Assets that already existed were created under the old rule, where every
-- asset was immediately available and visible to employees. Backfilling them
-- to READY preserves that visibility; flipping them to PENDING would make the
-- entire existing inventory disappear from employees at once.
--
-- The warehouse can send any individual asset back to PENDING afterwards.
UPDATE "Asset" SET "lifecycleStage" = 'READY';
