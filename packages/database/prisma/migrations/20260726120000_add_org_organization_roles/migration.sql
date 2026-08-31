-- ORG: add the three operational organization roles.
--
-- WAREHOUSE  (المستودعات) — creates/audits assets, approves requests, hands over
-- FINANCE    (المالية)    — financial coding, depreciation, financial analytics
-- INVENTORY  (المخزون)    — organization-wide oversight, may delete assets
--
-- Postgres cannot add enum values inside a transaction block that later uses
-- them, but adding values alone is safe here: no existing row is rewritten and
-- no default changes. Existing ADMIN/BASE/OWNER/SELF_SERVICE rows are untouched.

ALTER TYPE "OrganizationRoles" ADD VALUE IF NOT EXISTS 'WAREHOUSE';
ALTER TYPE "OrganizationRoles" ADD VALUE IF NOT EXISTS 'FINANCE';
ALTER TYPE "OrganizationRoles" ADD VALUE IF NOT EXISTS 'INVENTORY';
