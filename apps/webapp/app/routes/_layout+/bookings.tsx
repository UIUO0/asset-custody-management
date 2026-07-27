import { useTranslation } from "react-i18next";
import type { MetaFunction, ShouldRevalidateFunctionArgs } from "react-router";
import { Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { skipRevalidationOnClientViewChange } from "~/utils/list-view-params";

export function loader() {
  return null;
}

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [{ title: appendToMetaTitle(resources.nav.bookings) }];
};

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs) {
  /**
   * If we are toggliong the sidebar, no need to revalidate this loader.
   * Revalidation happens in _layout
   */
  if (args.actionResult?.isTogglingSidebar) {
    return false;
  }

  // Skip revalidation for client-view-only navigations (e.g. the booking
  // overview's client-side search/sort/pagination), so they never hit the
  // server through this layout.
  return skipRevalidationOnClientViewChange(args);
}

/** Breadcrumb link for the bookings section (component so it can use the hook). */
function BookingsBreadcrumb() {
  const { t } = useTranslation();
  return <Link to="/bookings">{t("nav.bookings")}</Link>;
}

export const handle = {
  breadcrumb: () => <BookingsBreadcrumb />,
};

export default function BookingsPage() {
  return <Outlet />;
}

export const ErrorBoundary = () => <ErrorContent />;
