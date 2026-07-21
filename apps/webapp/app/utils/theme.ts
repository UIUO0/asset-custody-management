/**
 * Theme preference — light / dark / system.
 *
 * The user's choice is persisted in a readable cookie so the server can render
 * the correct theme class on `<html>` (no flash of the wrong theme) and the
 * inline head script can resolve "system" against `prefers-color-scheme`
 * before first paint.
 *
 * Tailwind is configured with `darkMode: "class"`, so everything downstream
 * keys off the `dark` class on the `<html>` element.
 *
 * @see {@link file://./../components/layout/theme-switcher.tsx} — the UI control
 * @see {@link file://./../root.tsx} — where the class and no-flash script are applied
 */

/** The three states the user can pick from. */
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The two concrete themes a preference can resolve to. */
export type ResolvedTheme = "light" | "dark";

/** Cookie that persists the user's explicit theme choice. */
export const THEME_COOKIE_NAME = "epda_theme";

/** Preference used when the request carries no stored choice. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

/**
 * Narrows an arbitrary string to a theme preference.
 *
 * @param value - Candidate value (from a cookie or form field)
 * @returns The matching preference, or `null` when unrecognised
 */
export function parseThemePreference(
  value: string | null | undefined
): ThemePreference | null {
  if (!value) return null;
  return (THEME_PREFERENCES as readonly string[]).includes(value)
    ? (value as ThemePreference)
    : null;
}

/**
 * Reads the stored theme preference out of a Cookie header.
 *
 * @param cookieHeader - Raw `Cookie` request header
 * @returns The stored preference, or the default when absent/invalid
 */
export function getThemePreference(
  cookieHeader: string | null
): ThemePreference {
  if (!cookieHeader) return DEFAULT_THEME_PREFERENCE;

  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${THEME_COOKIE_NAME}=`))
    ?.split("=")[1];

  return (
    parseThemePreference(raw ? decodeURIComponent(raw) : null) ??
    DEFAULT_THEME_PREFERENCE
  );
}

/**
 * Builds a `Set-Cookie` value persisting a theme choice.
 *
 * Not `HttpOnly` — the inline no-flash script must read it before hydration.
 *
 * @param preference - The preference the user selected
 * @returns A `Set-Cookie` header value, valid for one year
 */
export function serializeThemeCookie(preference: ThemePreference): string {
  const oneYearInSeconds = 60 * 60 * 24 * 365;
  return `${THEME_COOKIE_NAME}=${preference}; Path=/; Max-Age=${oneYearInSeconds}; SameSite=Lax`;
}

/**
 * Inline script that applies the theme class before first paint.
 *
 * Runs synchronously in `<head>`, ahead of any CSS-driven paint, which is what
 * prevents the white flash a dark-mode user would otherwise see on every
 * navigation. Kept dependency-free and defensive (wrapped in try/catch) since a
 * throw here would block the document.
 *
 * @param preference - The server-known preference, inlined as the starting point
 * @returns JavaScript source to inject via `dangerouslySetInnerHTML`
 */
export function getThemeInitScript(preference: ThemePreference): string {
  return `
(function() {
  try {
    var pref = ${JSON.stringify(preference)};
    var resolved = pref;
    if (pref === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
`.trim();
}
