/**
 * حدود الرسملة — the capitalisation thresholds that decide أصل vs مادة.
 *
 * The authority capitalises above a different amount per kind of thing: a
 * vehicle above 10,000 SAR, everything else above 1,000. An item bought for
 * more than its category's threshold is a **أصل** (durable, capitalised,
 * depreciated, and coded by المالية); at or below it, a **مادة** (consumable,
 * expensed on issue).
 *
 * ## Where the rule lives
 *
 * Here, in one table, rather than spread across the form and the service. The
 * warehouse form previews the outcome from this module and the server decides
 * from the same module — so the operator cannot be shown one answer and have
 * another stored.
 *
 * ## Why a code table and not a database one
 *
 * These are five fixed policy numbers that nobody can edit in the product yet.
 * A table would need a settings screen, a permission, an audit trail and a
 * migration for its seed — all to hold five rows that currently change by
 * someone telling us. When finance needs to edit them, this becomes a settings
 * category (`app/modules/app-settings/registry.ts` already has the shape) and
 * only {@link thresholdFor} changes.
 *
 * ## Amounts are halalas
 *
 * Integer halalas throughout, like every other amount in the receipt flow — the
 * comparison that decides an item's accounting treatment must not depend on
 * float rounding. See `utils/money.ts`.
 *
 * A plain module (no `.server`): the receipt form renders the preview from it.
 *
 * @see {@link file://./classification.ts} the rule applied
 * @see {@link file://./../../utils/money.ts} why halalas
 */

import type { ItemCategory } from "@prisma/client";
import { HALALAS_PER_RIYAL } from "~/utils/money";

/**
 * Browser-safe category values.
 *
 * Not imported from `@prisma/client` as values — Prisma's enum objects are
 * `undefined` in the browser bundle, and this module renders in the form. Same
 * rule as `enums.ts`, which this deliberately mirrors.
 */
export const ItemCategoryValue = {
  FURNITURE: "FURNITURE",
  VEHICLES: "VEHICLES",
  OFFICE_EQUIPMENT: "OFFICE_EQUIPMENT",
  IT_EQUIPMENT: "IT_EQUIPMENT",
  OTHER_EQUIPMENT: "OTHER_EQUIPMENT",
} as const satisfies Record<ItemCategory, ItemCategory>;

/** One category: what it is called, and what it costs to become an asset. */
export type CapitalizationRule = {
  category: ItemCategory;
  /** Arabic label, as the authority writes it. */
  label: string;
  /**
   * حد الرسملة in **riyals**, for display next to the picker so the operator
   * can see the rule they are being judged by.
   */
  thresholdRiyals: number;
};

/**
 * The authority's table, in its own order.
 *
 * Vehicles are the only outlier at 10,000; keeping the others explicit rather
 * than defaulting them means a future change to one category is a one-line edit
 * that reads as a decision, not a change to a shared fallback.
 */
export const CAPITALIZATION_RULES: readonly CapitalizationRule[] = [
  {
    category: ItemCategoryValue.FURNITURE,
    label: "أثاث ومفروشات",
    thresholdRiyals: 1_000,
  },
  {
    category: ItemCategoryValue.VEHICLES,
    label: "مركبات",
    thresholdRiyals: 10_000,
  },
  {
    category: ItemCategoryValue.OFFICE_EQUIPMENT,
    label: "أجهزة مكتبية",
    thresholdRiyals: 1_000,
  },
  {
    category: ItemCategoryValue.IT_EQUIPMENT,
    label: "أجهزة تقنية",
    thresholdRiyals: 1_000,
  },
  {
    category: ItemCategoryValue.OTHER_EQUIPMENT,
    label: "أجهزة وتقنيات أخر",
    thresholdRiyals: 1_000,
  },
];

/** Category → rule, for O(1) lookup. */
const BY_CATEGORY = new Map<string, CapitalizationRule>(
  CAPITALIZATION_RULES.map((rule) => [rule.category, rule]),
);

/**
 * The capitalisation threshold for a category, in halalas.
 *
 * @param category - The item's category
 * @returns The threshold in halalas, or `null` for an unrecognised category
 */
export function thresholdFor(category: ItemCategory | null): number | null {
  if (!category) return null;

  const rule = BY_CATEGORY.get(category);
  return rule ? rule.thresholdRiyals * HALALAS_PER_RIYAL : null;
}

/**
 * Arabic label for a category.
 *
 * @param category - The category, or null for an unclassified line
 * @returns The label, or a dash
 */
export function categoryLabel(category: ItemCategory | null): string {
  return category ? BY_CATEGORY.get(category)?.label ?? category : "—";
}

/**
 * Narrows an arbitrary string to a known category.
 *
 * @param value - Candidate, typically from a form body
 */
export function isItemCategory(value: string): value is ItemCategory {
  return BY_CATEGORY.has(value);
}
