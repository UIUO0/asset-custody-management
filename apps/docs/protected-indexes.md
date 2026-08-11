# Protected Database Indexes

## Overview

This project maintains certain critical indexes that Prisma attempts to drop during migrations. We have implemented an automated protection system to prevent this from happening.

## Protected Indexes

**The list is currently empty** (`packages/database/src/protected-indexes.ts`).

Both entries it once held are gone with the models they served:

- `_AssetToBooking_Asset_idx` — removed with the booking system (2026-08-06)
- `_AssetToTag_asset_idx` — removed with the `Tag` model (2026-08-11)

An empty list does not mean the mechanism is obsolete — see the caveat below before adding to it.

## How It Works

1. When Prisma generates a new migration, our post-migration script automatically removes any DROP INDEX statements for these protected indexes
2. This ensures the indexes remain in place while allowing Prisma migrations to proceed normally

## Important Notes

- Never manually drop these indexes
- If you need to modify these indexes, update the `PROTECTED_INDEXES` array in `packages/database/src/protected-indexes.ts`
- The protection script runs automatically after `prisma migrate dev` and `prisma migrate deploy`

### ⚠️ This is not the fix for ordinary index drift

An index that exists in the database but is **not declared in `schema.prisma`** reads as drift to Prisma, which emits a `DROP INDEX` for it in every migration you generate — including migrations about completely unrelated tables. That has bitten this repo before (four unrelated indexes were dropped by a migration about a new role enum).

**Declare the index in the schema instead.** A declared index that already exists produces no diff at all, so no statement is generated in the first place. Even GIN / trigram indexes can be declared:

```prisma
@@index([address(ops: raw("gin_trgm_ops"))], type: Gin, name: "Location_address_trgm_idx")
```

Reserve `PROTECTED_INDEXES` for indexes Prisma genuinely cannot express.

To find more information about the original solution, see the upstream PR that introduced it: [#1546](https://github.com/Shelf-nu/shelf.nu/pull/1546)
