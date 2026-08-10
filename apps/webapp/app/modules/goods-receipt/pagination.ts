/**
 * عدد الصفحات — how many sheets a receipt prints onto.
 *
 * Both paper forms have a «عدد الصفحات» box in their header. It is a fact about
 * the document, not a decision: a receipt with forty item lines is four pages
 * whatever anybody types. So the system derives it and the operator never
 * touches it.
 *
 * ## Why it was worth taking away from the operator
 *
 * The box was a free-text number, filled in before the item table existed —
 * the operator wrote "1", then pasted in thirty lines, and the saved document
 * claimed one page while printing four. Nothing checked, and the number is
 * printed on a signed form that is filed as the record of the delivery. A field
 * that is wrong whenever the form is long is worse than no field at all.
 *
 * ## The number has to match what actually prints
 *
 * {@link ITEM_LINES_PER_PAGE} is tied to the print layout in
 * `receipts.$receiptId_.print.tsx` — A4 portrait, the authority's header and
 * reference tables above the item table, and the totals and signature blocks
 * below it. Change that layout and this constant has to move with it, or the
 * form starts printing a page count it does not honour.
 *
 * A plain module (no `.server`): the receipt form previews the count live as
 * rows are added, from the very function the server stores.
 *
 * @see {@link file://./../../routes/_layout+/receipts.$receiptId_.print.tsx}
 * @see {@link file://./service.server.ts} where it is stored
 */

/**
 * Item rows that fit on one printed page.
 *
 * Deliberately the *conservative* figure — the count it produces may be one
 * more than strictly needed for a receipt that lands exactly on the boundary,
 * never one less. Under-reporting is the failure that matters: a page count
 * lower than the sheets in someone's hand reads as a missing page.
 */
export const ITEM_LINES_PER_PAGE = 12;

/**
 * Pages a receipt with this many item lines will print onto.
 *
 * @param lineCount - Number of rows in the item table
 * @returns At least 1 — an empty draft is still one sheet of paper
 */
export function pageCountFor(lineCount: number): number {
  if (!Number.isFinite(lineCount) || lineCount <= 0) return 1;

  return Math.max(1, Math.ceil(lineCount / ITEM_LINES_PER_PAGE));
}
