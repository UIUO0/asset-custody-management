import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import { ShelfFullLogo } from "~/components/marketing/logos";
import { usePosition } from "~/hooks/use-position";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

export const meta: MetaFunction = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [
    { title: appendToMetaTitle(resources.bulkActions["type_download-qr"]) },
  ];
};

export default function QR() {
  const { t } = useTranslation();
  usePosition();
  return (
    <div className="container h-full min-h-screen px-4 py-12">
      <div className="flex h-full flex-col justify-center text-center">
        <Link
          to="/"
          title={t("nav.home")}
          className="logo mx-auto inline-block h-[32px]"
          reloadDocument
        >
          <ShelfFullLogo className="h-full" />
        </Link>

        <Outlet />
      </div>
    </div>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
