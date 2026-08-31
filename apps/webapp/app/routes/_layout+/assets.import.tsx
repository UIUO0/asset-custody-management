/**
 * Legacy CSV asset import — superseded by the goods-receipt forms.
 *
 * The mirror of `assets.new.tsx`: ORG books stock in on مذكرة/محضر استلام, and
 * a spreadsheet of titles carries none of what those documents exist to
 * record — supplier, purchase order, inspection reference, unit price, or the
 * three signatures.
 *
 * Closing the single-asset door and leaving the bulk one open would have been
 * worse than closing neither: an operator blocked from adding one asset would
 * simply upload a one-row CSV, and the requirement would look like an
 * inconvenience to route around rather than a control.
 *
 * `assets.import-update.tsx` is deliberately **not** closed. It updates
 * existing rows and creates nothing, which is the round trip المالية need
 * (export → edit in Excel → import the coding back).
 *
 * The previous implementation lives in git history at the commit that
 * introduced the receipt flow.
 *
 * @see {@link file://./receipts.new.tsx} the flow that replaces this
 * @see {@link file://./../../modules/goods-receipt/intake-guard.server.ts}
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { assertIntakeClosed } from "~/modules/goods-receipt/intake-guard.server";

export function loader(_args: LoaderFunctionArgs): never {
  assertIntakeClosed();
}

export function action(_args: ActionFunctionArgs): never {
  // 303 so a replayed upload is re-issued as a GET rather than posting its
  // multipart body at the receipt form.
  assertIntakeClosed({ status: 303 });
}
