/**
 * Layout route for the goods-receipt section.
 *
 * Renders nothing but an `<Outlet/>`, and exists for a structural reason:
 * without it, `remix-flat-routes` has no parent to attach `receipts._index.tsx`
 * to and emits `<Route path="receipts" index>` — a route that is both pathed
 * and an index. React Router treats an index route as the parent's default
 * child, so one carrying its own path segment never matches, and every
 * `/receipts` navigation resolved to nothing while the previous page stayed on
 * screen.
 *
 * With this file present the tree is the ordinary shape used everywhere else in
 * `_layout+` (compare `assets.tsx`): a pathed parent, a pathless index child,
 * and siblings for `new` and `:receiptId`.
 *
 * Deliberately no `requirePermission` here — each child gates itself on
 * `goodsReceipt`, and a permission check in a layout is inherited rather than
 * enforced (a child fetched directly on client navigation would skip it).
 *
 * @see {@link file://./receipts._index.tsx} the list
 * @see {@link file://./receipts.new.tsx} the intake forms
 */

import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

export const meta = () => [{ title: appendToMetaTitle("نماذج الاستلام") }];

// A layout loader is required for the route to participate in revalidation the
// same way its siblings do; there is nothing for it to fetch.
export function loader() {
  return null;
}

/**
 * Breadcrumb link for the receipts section.
 *
 * A named component rather than an inline arrow in `handle` so it can legally
 * call the translation hook — `handle.breadcrumb` is rendered as JSX by the
 * layout.
 */
function ReceiptsBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/receipts">{t("nav.receipts")}</Link>;
}

export const handle = {
  breadcrumb: () => <ReceiptsBreadcrumb />,
};

export default function ReceiptsPage() {
  return <Outlet />;
}

export const ErrorBoundary = () => <ErrorContent />;
