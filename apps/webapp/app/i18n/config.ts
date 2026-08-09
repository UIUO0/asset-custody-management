/**
 * i18n configuration — EPDA (هيئة تطوير المنطقة الشرقية)
 *
 * Single source of truth for the supported locales, their text direction, and
 * the shared i18next options used on both the server and the client. Arabic is
 * the default because the primary audience is EPDA staff; English is kept as a
 * full peer locale for non-Arabic-speaking staff and vendors.
 *
 * Text direction is derived from the locale here (never hardcoded in
 * components), so adding a locale is a one-line change.
 *
 * @see {@link file://./i18n.server.ts} — server-side instance + locale detection
 * @see {@link file://./locales/ar.json} — Arabic resources
 */

import ar from "./locales/ar.json";
import en from "./locales/en.json";

/** Locales the app ships with. First entry is the fallback/default. */
export const SUPPORTED_LOCALES = ["ar", "en"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Locale used when the request carries no usable preference. */
export const DEFAULT_LOCALE: SupportedLocale = "ar";

/** Cookie that persists the user's explicit language choice. */
export const LOCALE_COOKIE_NAME = "epda_locale";

/** Text direction per locale. Drives `<html dir>` and the RTL Tailwind variant. */
export const LOCALE_DIRECTION: Record<SupportedLocale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

/** Native display name per locale — shown in the language switcher. */
export const LOCALE_LABEL: Record<SupportedLocale, string> = {
  ar: "العربية",
  en: "English",
};

/**
 * Narrows an arbitrary string to a supported locale.
 *
 * @param value - Candidate locale (from a cookie, header, or form field)
 * @returns The matching supported locale, or `null` when unsupported
 */
export function parseLocale(
  value: string | null | undefined,
): SupportedLocale | null {
  if (!value) return null;
  // Accept region subtags ("ar-SA" → "ar") so Accept-Language still matches.
  const base = value.toLowerCase().split("-")[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : null;
}

/**
 * Text direction for a locale.
 *
 * @param locale - A supported locale
 * @returns "rtl" for Arabic, "ltr" otherwise
 */
export function getDirection(locale: SupportedLocale): "rtl" | "ltr" {
  return LOCALE_DIRECTION[locale];
}

/** Translation resources, bundled so no async backend is needed. */
export const resources = {
  ar: { translation: ar },
  en: { translation: en },
} as const;

/** i18next options shared by the server and client instances. */
export const i18nConfig = {
  supportedLngs: [...SUPPORTED_LOCALES],
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: "translation",
  resources,
  interpolation: {
    // React already escapes interpolated values.
    escapeValue: false,
  },
} as const;
