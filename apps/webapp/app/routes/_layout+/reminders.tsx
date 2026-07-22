import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

export const meta = () => [{ title: appendToMetaTitle("Reminders") }];

export function loader() {
  return null;
}

/** Breadcrumb link for the reminders section (component so it can use the hook). */
function RemindersBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/reminders">{t("nav.reminders")}</Link>;
}

export const handle = {
  breadcrumb: () => <RemindersBreadcrumb />,
};

export default function RemindersPage() {
  return <Outlet />;
}

export const ErrorBoundary = () => <ErrorContent />;
