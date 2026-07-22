import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

export const meta = () => [{ title: appendToMetaTitle("Kits") }];

export function loader() {
  return null;
}

/** Breadcrumb link for the kits section (component so it can use the hook). */
function KitsBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/kits">{t("nav.kits")}</Link>;
}

export const handle = {
  breadcrumb: () => <KitsBreadcrumb />,
};

export default function Kits() {
  return <Outlet />;
}

export const ErrorBoundary = () => <ErrorContent />;
