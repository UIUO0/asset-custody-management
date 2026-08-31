/**
 * Server-side i18n — locale detection and per-request i18next instances.
 *
 * Detection order (first match wins):
 *   1. `org_locale` cookie — the user's explicit choice in the switcher
 *   2. `Accept-Language` header — the browser/OS preference
 *   3. `DEFAULT_LOCALE` (Arabic)
 *
 * Loaders call {@link getLocale} to resolve the locale, and the document
 * request handler calls {@link createI18nInstance} so SSR renders in the same
 * language the client will hydrate with (no flash of untranslated content).
 *
 * @see {@link file://./config.ts} — supported locales and shared options
 * @see {@link file://./../entry.server.tsx} — SSR wiring
 */

import { createInstance, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LOCALE,
  i18nConfig,
  LOCALE_COOKIE_NAME,
  parseLocale,
  type SupportedLocale,
} from "./config";

/**
 * Reads the persisted locale choice out of a Cookie header.
 *
 * Hand-parsed rather than routed through a Remix cookie helper: the value is a
 * short opaque enum, needs no signing, and must also be readable by the inline
 * no-flash script in the document head.
 *
 * @param cookieHeader - Raw `Cookie` request header
 * @returns The stored locale, or `null` when absent/unsupported
 */
function getLocaleFromCookie(
  cookieHeader: string | null,
): SupportedLocale | null {
  if (!cookieHeader) return null;

  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.split("=")[1];

  return parseLocale(raw ? decodeURIComponent(raw) : null);
}

/**
 * Picks the best supported locale from an `Accept-Language` header.
 *
 * @param header - Raw `Accept-Language` request header
 * @returns The highest-priority supported locale, or `null` when none match
 */
function getLocaleFromHeader(header: string | null): SupportedLocale | null {
  if (!header) return null;

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim(), quality: q ? Number(q) : 1 };
    })
    // Highest quality factor first — that's the user's strongest preference.
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    const locale = parseLocale(candidate.tag);
    if (locale) return locale;
  }

  return null;
}

/**
 * Resolves the locale for a request.
 *
 * @param request - The incoming request
 * @returns The locale to render in — always a supported one
 */
export function getLocale(request: Request): SupportedLocale {
  return (
    getLocaleFromCookie(request.headers.get("Cookie")) ??
    getLocaleFromHeader(request.headers.get("Accept-Language")) ??
    DEFAULT_LOCALE
  );
}

/**
 * Builds a `Set-Cookie` value persisting an explicit language choice.
 *
 * Not `HttpOnly`: the inline no-flash script reads it to set `<html lang/dir>`
 * before hydration. The value is a non-sensitive enum, so script readability
 * costs nothing and avoids a layout flash on first paint.
 *
 * @param locale - The locale the user selected
 * @returns A `Set-Cookie` header value, valid for one year
 */
export function serializeLocaleCookie(locale: SupportedLocale): string {
  const oneYearInSeconds = 60 * 60 * 24 * 365;
  return `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${oneYearInSeconds}; SameSite=Lax`;
}

/**
 * Creates a request-scoped i18next instance for server rendering.
 *
 * A fresh instance per request is required: a shared singleton would leak one
 * request's language into a concurrently-rendering request.
 *
 * @param locale - The locale to initialise with
 * @returns An initialised i18next instance bound to `locale`
 */
export async function createI18nInstance(
  locale: SupportedLocale,
): Promise<I18nInstance> {
  const instance = createInstance();

  await instance.use(initReactI18next).init({
    ...i18nConfig,
    lng: locale,
  });

  return instance;
}

/**
 * Memoised, locale-bound instances backing {@link getFixedT}.
 *
 * Safe to share across requests — unlike the SSR instance created per request
 * by {@link createI18nInstance}, these are pinned to one language and are only
 * ever read from, so there is no cross-request language leak.
 */
const fixedInstances = new Map<SupportedLocale, Promise<I18nInstance>>();

/**
 * Returns a translation function for use inside loaders and actions, where the
 * React `useTranslation` hook is unavailable.
 *
 * Use this for user-facing strings a loader puts into its payload — page
 * headers, search-field labels, empty-state copy. Do NOT use it for
 * `sendNotification` or `ShelfError` messages, which stay in English by
 * convention.
 *
 * @param locale - Locale for the request, from {@link getLocale}
 * @returns The i18next `t` function bound to `locale`
 *
 * @example
 * const t = await getFixedT(getLocale(request));
 * return payload({ header: { title: t("assets.importTitle") } });
 */
export async function getFixedT(locale: SupportedLocale) {
  let instance = fixedInstances.get(locale);

  if (!instance) {
    instance = createI18nInstance(locale);
    fixedInstances.set(locale, instance);
  }

  return (await instance).t;
}
