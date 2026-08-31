-- ORG: instance-wide settings + external-integration API keys.
--
-- Two additive tables. Nothing existing is read or rewritten, so this migration
-- is safe to apply to a live database: absent settings fall back to the
-- registry defaults in `app/modules/app-settings/registry.ts`, which are in
-- turn seeded from the current environment variables. A deployment that applies
-- this migration and changes nothing else behaves exactly as it did before.

-- ── AppSetting ────────────────────────────────────────────────────────────
--
-- Not organization-scoped on purpose: the authentication settings are read on
-- the login screen, before any workspace context exists.
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "AppSetting_category_idx" ON "AppSetting"("category");
CREATE INDEX "AppSetting_updatedById_idx" ON "AppSetting"("updatedById");

-- SetNull, not Cascade: removing the admin who last edited a setting must not
-- delete the setting itself.
ALTER TABLE "AppSetting"
  ADD CONSTRAINT "AppSetting_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ApiKey ────────────────────────────────────────────────────────────────
--
-- The token is never stored — only its SHA-256 digest ("hashedKey") and its
-- leading display segment ("prefix").
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "scopes" TEXT[],
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- Unique so authentication is a single indexed lookup on the digest, and so a
-- prefix can be used as a stable display handle.
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");
CREATE INDEX "ApiKey_createdById_idx" ON "ApiKey"("createdById");

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ApiKey_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
