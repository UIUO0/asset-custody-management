/**
 * Legacy asset duplication — superseded by the goods-receipt forms.
 *
 * The third intake door, and the least obvious one. `/assets/new` and
 * `/assets/import` were closed when the receipt flow shipped, but duplication
 * created assets by another name: it needs only `asset.create`, it is reachable
 * from the asset actions dropdown, and it minted up to
 * `MAX_DUPLICATES_ALLOWED` rows carrying **no** `receiptLine`. Those rows then
 * passed `assertReceiptSignedBeforeApproval` untouched — that guard exempts
 * items with no receipt line on purpose, for the inventory that predates the
 * flow — and went straight to `READY`.
 *
 * So the paper controls could be walked around entirely: open any existing
 * asset, duplicate it, approve the copies. No supplier, no purchase order, no
 * unit price, no three signatures. Ten copies of a laptop the authority never
 * bought, indistinguishable in the register from ten it did.
 *
 * Closed the same way as its two siblings: `assertIntakeClosed` in the loader
 * **and** the action, so a POST replayed from a tab opened before this shipped
 * cannot slip through behind the redirect. The dropdown entry is gone too — a
 * button that only redirects is a worse experience than no button.
 *
 * Genuinely needing many identical items is the case the receipt forms already
 * answer better: one line with a quantity, priced and referenced to its
 * purchase order.
 *
 * The previous implementation lives in git history at the commit that closed
 * this door.
 *
 * @see {@link file://./receipts.new.tsx} the flow that replaces it
 * @see {@link file://./../../modules/goods-receipt/intake-guard.server.ts}
 * @see {@link file://./../../modules/goods-receipt/receipt-gate.server.ts}
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { assertIntakeClosed } from "~/modules/goods-receipt/intake-guard.server";

export function loader(_args: LoaderFunctionArgs): never {
  assertIntakeClosed();
}

export function action(_args: ActionFunctionArgs): never {
  // 303 so a replayed POST is re-issued as a GET rather than posting its body
  // at the receipt form.
  assertIntakeClosed({ status: 303 });
}
