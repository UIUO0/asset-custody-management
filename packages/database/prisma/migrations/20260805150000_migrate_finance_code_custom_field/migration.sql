-- EPDA: fold the «ترميز الاصل» custom field into `Asset.financeCode`.
--
-- Two places held the finance coding number and neither knew about the other:
-- a workspace custom field created before the receipt flow existed, and the
-- `Asset.financeCode` column the flow added. An asset coded through one read as
-- uncoded through the other.
--
-- The column wins. It is typed, it is covered by the partial index that drives
-- المالية's queue, and the service layer enforces "أصول only" on it — none of
-- which a free-text custom field can do.
--
-- This migration is data-only and conservative:
--
--   * It copies, never overwrites. A row that already has a `financeCode` keeps
--     it; the custom field is only consulted where the column is empty.
--   * It leaves the custom field's rows in place. Deleting them would destroy
--     the only copy of the value if this migration turns out to be wrong, and
--     they cost nothing where they sit.
--   * It deactivates the custom field rather than dropping it, so the history
--     stays readable and no `AssetCustomFieldValue` is orphaned.
--
-- Matching the field by its Arabic name is fragile, and deliberately so: it is
-- the only handle the field has. A workspace that spelled it differently is not
-- migrated, which is the safe direction — nothing is lost, and the duplicate
-- simply remains visible for someone to resolve by hand.

-- 1. Copy the value across where the column has nothing.
--
-- `value->>'valueText'` is how the custom-field writer stores TEXT values (it
-- also keeps a `raw` copy); reading the typed key rather than `raw` keeps this
-- correct if `raw` ever carries formatting.
UPDATE "Asset" a
SET "financeCode" = NULLIF(TRIM(v.value->>'valueText'), '')
FROM "AssetCustomFieldValue" v
JOIN "CustomField" cf ON cf.id = v."customFieldId"
WHERE v."assetId" = a.id
  AND cf.name IN ('ترميز الاصل', 'ترميز الأصل')
  AND a."financeCode" IS NULL
  AND NULLIF(TRIM(v.value->>'valueText'), '') IS NOT NULL;

-- 2. Retire the field so nobody types a second coding number into it.
--
-- `active = false` hides it from the asset form while leaving every existing
-- value readable — the reversible half of a decision that is otherwise
-- irreversible.
UPDATE "CustomField"
SET active = false
WHERE name IN ('ترميز الاصل', 'ترميز الأصل');
