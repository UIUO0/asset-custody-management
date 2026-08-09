/**
 * أصل / مادة classification.
 *
 * An item is a **أصل** when its purchase price exceeds the capitalisation
 * threshold for its category, and a **مادة** otherwise. The thresholds are in
 * `capitalization.ts`; this module is only the comparison and the decisions
 * around its edges.
 *
 * ## Unit price, not line total
 *
 * Three laptops at 4,500 each are three assets, not one 13,500 asset.
 * Capitalisation asks what a *thing* cost, so the comparison uses the unit
 * price. A line of 500 pens at 2.75 is 1,375 in total and still 500 مواد.
 *
 * ## Strictly greater
 *
 * «تتعدى حد الرسملة» — an item *at* the threshold is a مادة. A rule written
 * with `>=` would silently capitalise every 1,000-riyal desk, which is the
 * opposite of what the threshold is for.
 *
 * ## No category means no classification
 *
 * A line whose category the operator did not pick returns `null` rather than
 * guessing from the name or defaulting to مادة. A wrong classification is worse
 * than an absent one: مادة is expensed immediately, so defaulting would write
 * off assets silently, and the column would look authoritative while being made
 * up. Null is visible and answerable.
 *
 * A plain module: the receipt form previews the outcome as the operator types,
 * from the same function the server decides with.
 *
 * @see {@link file://./capitalization.ts} the thresholds
 * @see {@link file://./service.server.ts} the caller
 */

import type { ItemClass } from "@prisma/client";
import { thresholdFor } from "./capitalization";
import { ItemClassValue } from "./enums";
import type { ReceiptLineInput } from "./schema";

/**
 * Classifies one receipt line.
 *
 * @param line - The line as validated from the form, carrying its category and
 *   unit price in halalas
 * @returns `ASSET` above the threshold, `MATERIAL` at or below it, or `null`
 *   when the line has no category to judge it by
 */
export function classifyReceiptLine(
  line: Pick<ReceiptLineInput, "itemCategory" | "unitPrice">,
): ItemClass | null {
  const threshold = thresholdFor(line.itemCategory ?? null);

  if (threshold === null) return null;

  return line.unitPrice > threshold
    ? ItemClassValue.ASSET
    : ItemClassValue.MATERIAL;
}

/** Arabic labels. Internal — callers use {@link itemClassLabel}. */
const ITEM_CLASS_LABELS: Record<ItemClass, string> = {
  ASSET: "أصل",
  MATERIAL: "مادة",
};

/**
 * Display label for an item's class.
 *
 * @param itemClass - The class, or null for an unclassified item
 * @returns The Arabic label, or a dash
 */
export function itemClassLabel(itemClass: ItemClass | null): string {
  return itemClass ? ITEM_CLASS_LABELS[itemClass] : "—";
}
