import { useTranslation } from "react-i18next";
import { Link, useMatches, Outlet } from "react-router";
import { ErrorContent } from "~/components/errors";
import { LanguageSwitcher } from "~/components/layout/appearance-switcher";
import { ShelfSymbolLogo } from "~/components/marketing/logos";
import SubHeading from "~/components/shared/sub-heading";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

export const loader = () => null;

export const meta = () => [{ title: appendToMetaTitle("Authentication") }];

export default function App() {
  const { t } = useTranslation();
  const matches = useMatches();
  /** Find the title and subHeading from current route */
  const data = matches[matches.length - 1].data as {
    title?: string;
    subHeading?: string;
  };
  const { title, subHeading } = data;

  return (
    <main className="flex h-screen">
      <div className="relative flex size-full flex-col items-center justify-center p-6 lg:p-10">
        {/* Language is reachable before sign-in: staff must be able to
            switch to Arabic/English without an account. */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
          <LanguageSwitcher />
        </div>

        <div className=" mb-8 text-center">
          <Link to="/" reloadDocument>
            <ShelfSymbolLogo />
          </Link>

          <h1>{title}</h1>
          {subHeading && (
            <SubHeading className="max-w-md">{subHeading}</SubHeading>
          )}
        </div>
        <div className=" w-[360px]">
          <Outlet />
        </div>
      </div>
      <aside className="relative hidden h-full flex-col items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 p-8 lg:flex lg:w-[700px] xl:w-[900px]">
        <img
          className="relative z-10 w-[420px] max-w-full"
          src="/static/images/epda-logo-white-text.png"
          alt={t("common.appName")}
        />
        <p className="relative z-10 mt-6 text-center text-sm text-static-white/70">
          {t("auth.sidePanelTagline")}
        </p>
      </aside>
    </main>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
