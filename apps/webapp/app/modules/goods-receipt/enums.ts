/**
 * Goods-receipt enum values, safe to use in the browser.
 *
 * ## Why this file exists
 *
 * `import { GoodsReceiptType } from "@prisma/client"` works on the server and
 * is **`undefined` in the browser bundle**. The webapp aliases
 * `.prisma/client/index-browser` for client builds, and Vite additionally keeps
 * a pre-optimized copy of `@prisma/client` under `node_modules/.vite` — so a
 * newly added enum stays missing on the client even after `db:generate`, until
 * that cache is cleared.
 *
 * The failure is silent and expensive: the module throws
 * `Cannot read properties of undefined` while React Router is loading the route,
 * the navigation aborts, and the user sits on the previous page with no error.
 * That is exactly the bug these constants were introduced to kill, and it is
 * the same trap `assets.new.tsx` had already worked around by hand.
 *
 * ## The rule
 *
 * Anything that runs in the browser — components, neutral modules like
 * `form-shape.ts`, and the client half of a route module — imports enum
 * **values** from here. `@prisma/client` may still be imported for **types**
 * (`import type`), which are erased at build time and cost nothing.
 *
 * Server-only modules (`*.server.ts`) may keep importing the real enums.
 *
 * ## Why these cannot drift
 *
 * Each constant is `satisfies Record<PrismaEnum, PrismaEnum>`, so adding a
 * member to the schema without adding it here is a compile error rather than a
 * runtime surprise.
 *
 * @see {@link file://./../../../../../CLAUDE.md} pitfall #3 — the Vite/Prisma cache
 */

import type {
  GoodsReceiptLineTracking as PrismaLineTracking,
  GoodsReceiptParty as PrismaParty,
  GoodsReceiptState as PrismaState,
  GoodsReceiptType as PrismaType,
  ItemClass as PrismaItemClass,
} from "@prisma/client";

/** مذكرة استلام (نموذج ٢) / محضر استلام (نموذج ٣). */
export const ReceiptType = {
  MEMO: "MEMO",
  RECORD: "RECORD",
} as const satisfies Record<PrismaType, PrismaType>;

/** Where a receipt sits between data entry and full signature. */
export const ReceiptState = {
  DRAFT: "DRAFT",
  SAVED: "SAVED",
  SIGNED: "SIGNED",
  VOIDED: "VOIDED",
} as const satisfies Record<PrismaState, PrismaState>;

/** The six signatory roles across both forms. */
export const ReceiptParty = {
  YARD_CUSTODIAN: "YARD_CUSTODIAN",
  WAREHOUSE_KEEPER: "WAREHOUSE_KEEPER",
  WAREHOUSE_HEAD: "WAREHOUSE_HEAD",
  RECEIVER: "RECEIVER",
  TECHNICAL_MEMBER: "TECHNICAL_MEMBER",
  RESPONSIBLE_HEAD: "RESPONSIBLE_HEAD",
} as const satisfies Record<PrismaParty, PrismaParty>;

/** Whether a line becomes N individual records or one counted row. */
export const LineTracking = {
  INDIVIDUAL: "INDIVIDUAL",
  BULK: "BULK",
} as const satisfies Record<PrismaLineTracking, PrismaLineTracking>;

/** أصل / مادة — set by `classifyReceiptLine` from the capitalization rules. */
export const ItemClassValue = {
  ASSET: "ASSET",
  MATERIAL: "MATERIAL",
} as const satisfies Record<PrismaItemClass, PrismaItemClass>;

// No type re-exports here on purpose: a `const X` plus a `type X` is
// declaration merging, which the lint rules reject, and consumers already
// import the types straight from `@prisma/client` with `import type`.
