/**
 * Appearance switchers — language (ar/en) and theme (light/dark/system).
 *
 * Both post to `/api/preferences`, which sets a cookie and redirects back to
 * the current URL. The round-trip is deliberate: switching the language flips
 * `<html dir>`, and re-rendering from the server is the only way to get every
 * layout laid out in the new direction without a client-side reflow flash.
 *
 * Plain forms rather than fetchers, so both controls keep working with
 * JavaScript unavailable.
 *
 * @see {@link file://./../../routes/api+/preferences.tsx} — the form target
 * @see {@link file://./../../utils/theme.ts} — theme preference model
 */

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useRouteLoaderData } from "react-router";
import { Form } from "~/components/custom-form";
import {
  LOCALE_LABEL,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "~/i18n/config";
import type { loader as rootLoader } from "~/root";
import { THEME_PREFERENCES, type ThemePreference } from "~/utils/theme";
import { tw } from "~/utils/tw";

/** Icon shown for each theme option. */
const THEME_ICON: Record<
  ThemePreference,
  typeof Sun | typeof Moon | typeof Monitor
> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Reads the active locale/theme from the root loader.
 *
 * @returns The current preferences, with safe fallbacks when the root loader
 *          hasn't run (e.g. inside an error boundary)
 */
function useAppearance() {
  const data = useRouteLoaderData<typeof rootLoader>("root");
  return {
    locale: (data?.locale ?? "ar") as SupportedLocale,
    themePreference: (data?.themePreference ?? "system") as ThemePreference,
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
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
 * Segmented theme control (light / dark / system).
 *
 * @param props.className - Extra classes for the wrapping form
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { themePreference } = useAppearance();
  const location = useLocation();

  return (
    <Form
      method="post"
      action="/api/preferences"
      className={tw("flex items-center gap-1", className)}
      aria-label={t("theme.toggle")}
    >
      <input
        type="hidden"
        name="redirectTo"
        value={`${location.pathname}${location.search}`}
      />
      {THEME_PREFERENCES.map((option) => {
        const Icon = THEME_ICON[option];
        const isActive = option === themePreference;
        return (
          <button
            key={option}
            type="submit"
            name="theme"
            value={option}
            aria-pressed={isActive}
            title={t(`theme.${option}`)}
            className={tw(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
              isActive
                ? "bg-primary-600 text-static-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="sr-only sm:not-sr-only">{t(`theme.${option}`)}</span>
          </button>
        );
      })}
    </Form>
  );
}

/**
 * Both switchers stacked with labels — for settings pages.
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

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gray-700">
          {t("common.theme")}
        </span>
        <ThemeSwitcher className="mt-1" />
      </div>
    </div>
  );
}
