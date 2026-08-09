/**
 * Parent route for `/purchase-orders`.
 *
 * Exists so the index is a proper child rather than a pathed index route —
 * flat-routes emits `path + index` for a bare `X._index.tsx`, which the client
 * router resolves against `/` instead of `/X` and leaves navigation dead. Same
 * shape as `assets.tsx` and `receipts.tsx`, and the same trap documented in
 * CLAUDE.md.
 *
 * @see {@link file://./purchase-orders._index.tsx} the listing
 */

import { Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

/**
 * Fallback title only. Both children set their own — the index and the order
 * detail — and the most specific match wins; this covers the layout itself.
 */
export const meta = () => [
  { title: appendToMetaTitle("الأصناف بأوامر الشراء") },
];

export default function PurchaseOrdersLayout() {
  return <Outlet />;
}

export const ErrorBoundary = () => <ErrorContent />;
