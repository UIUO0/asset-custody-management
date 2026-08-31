-- ORG: item categories, capitalisation-driven classification, and finance coding.
--
-- Adds the input that decides أصل vs مادة (the item's category, which carries a
-- capitalisation threshold) and the output of the finance step that follows for
-- assets (رقم الترميز).
--
-- Purely additive. Existing lines and assets get NULL for every new column,
-- which is the correct reading: they were booked in before categories existed
-- and were never classified. Backfilling them would mean guessing an accounting
-- classification from a name, so they stay unclassified until someone says what
-- they were.

-- The five categories the authority capitalises separately. Fixed rather than
-- workspace-editable: inventing a category would mean inventing a threshold
-- with it, which is deciding an accounting rule by accident.
CREATE TYPE "ItemCategory" AS ENUM (
  'FURNITURE',
  'VEHICLES',
  'OFFICE_EQUIPMENT',
  'IT_EQUIPMENT',
  'OTHER_EQUIPMENT'
);

ALTER TABLE "GoodsReceiptLine" ADD COLUMN "itemCategory" "ItemCategory";

ALTER TABLE "Asset"
  ADD COLUMN "itemCategory" "ItemCategory",
  -- رقم الترميز. Free text, no uniqueness: the approved decision is that the
  -- coding format belongs entirely to the finance department.
  ADD COLUMN "financeCode" TEXT,
  ADD COLUMN "financeCodedAt" TIMESTAMPTZ(3),
  ADD COLUMN "financeCodedById" TEXT;

-- SetNull: the coding outlives the finance account that entered it.
ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_financeCodedById_fkey"
    FOREIGN KEY ("financeCodedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Asset_financeCodedById_idx" ON "Asset"("financeCodedById");

-- Drives the finance queue: "assets in this workspace still awaiting a code".
-- Partial, because the queue is only ever the ASSET rows without a code — مواد
-- are expensed and never coded, so indexing them would be dead weight.
CREATE INDEX "Asset_awaiting_finance_code_idx"
  ON "Asset"("organizationId")
  WHERE "itemClass" = 'ASSET' AND "financeCode" IS NULL;
