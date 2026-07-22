import { useTranslation } from "react-i18next";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

export const meta = () => [{ title: appendToMetaTitle("Assets") }];

export function loader() {
  return null;
}

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  /**
   * If we are toggliong the sidebar, no need to revalidate this loader.
   * Revalidation happens in _layout
   */
  if (actionResult?.isTogglingSidebar) {
    return false;
  }

  return defaultShouldRevalidate;
}

/**
 * Breadcrumb link for the assets section.
 *
 * A component (not an inline arrow in `handle`) so it can legally call the
 * translation hook — `handle.breadcrumb` is rendered as JSX by the layout.
 */
function AssetsBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/assets">{t("nav.assets")}</Link>;
}

export const handle = {
  breadcrumb: () => <AssetsBreadcrumb />,
};

export default function AssetsPage() {
  return <Outlet />;
}

export const ErrorBoundary = () => <ErrorContent />;
