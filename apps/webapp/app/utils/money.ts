/**
 * Saudi riyal money handling for the goods-receipt forms.
 *
 * The paper forms split every amount into two columns — **ريال** and **هللة** —
 * and the operator types into both. This module is the single place that turns
 * that pair into a number and back.
 *
 * ## Why integers
 *
 * Amounts are stored and computed as **integer halalas**, never as floats. A
 * receipt is an accounting document: its printed total has to equal the paper it
 * was copied from, and `0.1 + 0.2 !== 0.3` is enough to break that. Working in
 * the smallest unit removes the question entirely — every value is exact, and
 * `quantity × unitPrice` cannot drift.
 *
 * `Asset.valuation` is a `Float` for historical reasons; {@link halalasToRiyals}
 * is the one place that conversion happens, at the boundary, once.
 *
 * A plain module (no `.server`): the form needs the same arithmetic client-side
 * to show a running total, and two implementations of "what does this add up
 * to" is exactly the kind of divergence that produces a document nobody trusts.
 *
 * @see {@link file://./../modules/goods-receipt/service.server.ts} the main consumer
 */

/** Halalas in one riyal. */
export const HALALAS_PER_RIYAL = 100;

/**
 * Largest amount accepted, in halalas — 10 billion riyals.
 *
 * Not a business rule but an overflow guard: the database column is a 32-bit
 * `INTEGER`, and a receipt total is the sum of its lines. Rejecting absurd
 * input at the edge is how a typo becomes a validation error instead of a
 * silent wrap to a negative total.
 */
export const MAX_HALALAS = 1_000_000_000_000;

/** An amount as the two columns the form actually shows. */
export type RiyalParts = {
  /** ريال */
  riyals: number;
  /** هللة — always 0…99. */
  halalas: number;
};

/**
 * Combines the two form columns into a single integer.
 *
 * Halalas above 99 are **not** normalised into riyals — they are rejected by
 * {@link parseRiyalParts}. Silently reading "150 هللة" as 1.50 riyal would be
 * this function deciding what the operator meant.
 *
 * @param parts - The ريال and هللة columns
 * @returns The amount in halalas
 */
export function toHalalas({ riyals, halalas }: RiyalParts): number {
  return riyals * HALALAS_PER_RIYAL + halalas;
}

/**
 * Splits an integer amount back into the two form columns.
 *
 * @param totalHalalas - Amount in halalas
 * @returns The ريال and هللة columns
 */
export function toRiyalParts(totalHalalas: number): RiyalParts {
  return {
    riyals: Math.trunc(totalHalalas / HALALAS_PER_RIYAL),
    halalas: totalHalalas % HALALAS_PER_RIYAL,
  };
}

/**
 * Validates and combines the two columns as the operator typed them.
 *
 * Both fields are optional on the form — a line may legitimately have no price
 * — so empty input reads as zero rather than as an error. Anything present but
 * not a whole non-negative number is rejected, including the halalas column
 * exceeding 99.
 *
 * @param riyals - Raw ريال input; empty, null or undefined means zero
 * @param halalas - Raw هللة input; empty, null or undefined means zero
 * @returns `{ ok: true, halalas }`, or `{ ok: false, message }` in Arabic for
 *   direct display next to the offending field
 */
export function parseRiyalParts(
  riyals: string | number | null | undefined,
  halalas: string | number | null | undefined,
): { ok: true; halalas: number } | { ok: false; message: string } {
  const riyalPart = parseWholeNumber(riyals);
  const halalaPart = parseWholeNumber(halalas);

  if (riyalPart === null) {
    return {
      ok: false,
      message: "قيمة الريال يجب أن تكون رقماً صحيحاً موجباً",
    };
  }

  if (halalaPart === null) {
    return {
      ok: false,
      message: "قيمة الهللة يجب أن تكون رقماً صحيحاً موجباً",
    };
  }

  if (halalaPart > 99) {
    // Not normalised on purpose — see `toHalalas`.
    return { ok: false, message: "الهللات يجب أن تكون بين ٠ و ٩٩" };
  }

  const total = toHalalas({ riyals: riyalPart, halalas: halalaPart });

  if (total > MAX_HALALAS) {
    return { ok: false, message: "المبلغ أكبر من الحد المسموح" };
  }

  return { ok: true, halalas: total };
}

/**
 * Parses one column.
 *
 * @param value - Raw input
 * @returns The whole number, 0 for empty input, or null if invalid
 */
function parseWholeNumber(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return 0;

  const asString = String(value).trim();
  if (asString === "") return 0;

  // Rejects decimals, signs and exponent notation. A price column that accepts
  // "1e9" or "-5" is a column that will eventually contain one.
  if (!/^\d+$/.test(asString)) return null;

  const parsed = Number(asString);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Formats an amount for display, e.g. `1٬234.50`.
 *
 * Uses Arabic-Saudi grouping with Western digits: the forms are printed with
 * Western numerals, and switching to Arabic-Indic here would make the screen
 * disagree with the paper.
 *
 * @param totalHalalas - Amount in halalas
 * @returns The formatted amount, without a currency symbol
 */
export function formatHalalas(totalHalalas: number): string {
  const { riyals, halalas } = toRiyalParts(totalHalalas);

  return `${riyals.toLocaleString("en-US")}.${String(halalas).padStart(
    2,
    "0",
  )}`;
}

/**
 * Converts a stored halala amount to the riyal float `Asset.valuation` holds.
 *
 * The one place this lossy step happens. `valuation` predates the receipt flow
 * and is a `Float`; the receipt keeps the exact integer, and the asset gets the
 * conventional decimal for display and reporting.
 *
 * @param totalHalalas - Amount in halalas
 * @returns The amount in riyals
 */
export function halalasToRiyals(totalHalalas: number): number {
  return totalHalalas / HALALAS_PER_RIYAL;
}

/**
 * Multiplies a unit price by a quantity.
 *
 * Trivial in integers, which is the point — this is the operation that would
 * accumulate error if the amounts were floats, and having it named makes the
 * receipt service read as arithmetic rather than as a cast.
 *
 * @param unitPriceHalalas - Price of one unit
 * @param quantity - How many
 * @returns The line total in halalas
 */
export function lineTotal(unitPriceHalalas: number, quantity: number): number {
  return unitPriceHalalas * quantity;
}
