/**
 * Appearance switcher — language (ar/en).
 *
 * Posts to `/api/preferences`, which sets a cookie and redirects back to
 * the current URL. The round-trip is deliberate: switching the language flips
 * `<html dir>`, and re-rendering from the server is the only way to get every
 * layout laid out in the new direction without a client-side reflow flash.
 *
 * Plain form rather than a fetcher, so the control keeps working with
 * JavaScript unavailable.
 *
 * why: dark mode is removed EPDA-wide — the theme switcher that used to live
 * here was deleted and the system always renders the light theme.
 *
 * @see {@link file://./../../routes/api+/preferences.tsx} — the form target
 */

import { useTranslation } from "react-i18next";
import { useLocation, useRouteLoaderData } from "react-router";
import { Form } from "~/components/custom-form";
import {
  LOCALE_LABEL,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "~/i18n/config";
import type { loader as rootLoader } from "~/root";
import { tw } from "~/utils/tw";

/**
 * Reads the active locale from the root loader.
 *
 * @returns The current locale, with a safe fallback when the root loader
 *          hasn't run (e.g. inside an error boundary)
 */
function useAppearance() {
  const data = useRouteLoaderData<typeof rootLoader>("root");
  return {
    locale: (data?.locale ?? "ar") as SupportedLocale,
  };
}

/**
 * Segmented language control.
 *
 * @param props.className - Extra classes for the wrapping form
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { locale } = useAppearance();
  const location = useLocation();

  return (
    <Form
      method="post"
      action="/api/preferences"
      // why: a full document reload is required when the language changes.
      // An SPA navigation would re-render loaders but leave the client-side
      // i18next instance (and every t() string already on screen) in the old
      // language until a manual refresh. `reloadDocument` makes the browser
      // submit natively and follow the redirect with a hard reload, so the
      // whole document comes back in the new language and direction.
      reloadDocument
      className={tw("flex items-center gap-1", className)}
      aria-label={t("language.switch")}
    >
      <input
        type="hidden"
        name="redirectTo"
        value={`${location.pathname}${location.search}`}
      />
      {SUPPORTED_LOCALES.map((option) => {
        const isActive = option === locale;
        return (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            aria-pressed={isActive}
            className={tw(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
              isActive
                ? "bg-primary-600 text-static-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
            )}
          >
            {LOCALE_LABEL[option]}
          </button>
        );
      })}
    </Form>
  );
}

/**
 * Language switcher with label — for settings pages.
 *
 * @param props.className - Extra classes for the wrapper
 */
export function AppearanceControls({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <div className={tw("flex flex-col gap-5", className)}>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">
          {t("common.language")}
        </span>
        <span className="text-xs text-gray-500">
          {t("settings.languageDescription")}
        </span>
        <LanguageSwitcher className="mt-1" />
      </div>
    </div>
  );
}
