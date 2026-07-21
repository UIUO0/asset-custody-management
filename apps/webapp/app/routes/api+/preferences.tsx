/**
 * Appearance preferences endpoint — language and theme.
 *
 * Both switchers post here. The preference is stored in a readable cookie so
 * the server can render `<html lang/dir/class>` correctly on the next request
 * (and the inline no-flash script can read it before first paint).
 *
 * Deliberately unauthenticated: the payload is a display preference tied to
 * the browser, not to a user record, so it must also work on the login screen
 * before a session exists. Values are validated against a fixed enum, so an
 * attacker can only set their own cookie to one of a few harmless constants.
 *
 * @see {@link file://./../../i18n/i18n.server.ts} — locale cookie serialisation
 * @see {@link file://./../../utils/theme.ts} — theme cookie serialisation
 * @see {@link file://./../../components/layout/appearance-switcher.tsx} — the UI
 */

import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { parseLocale } from "~/i18n/config";
import { serializeLocaleCookie } from "~/i18n/i18n.server";
import { makeShelfError } from "~/utils/error";
import { error, safeRedirect } from "~/utils/http.server";
import { parseThemePreference, serializeThemeCookie } from "~/utils/theme";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();

    const locale = parseLocale(String(formData.get("locale") ?? ""));
    const theme = parseThemePreference(String(formData.get("theme") ?? ""));
    const redirectTo = formData.get("redirectTo");

    const cookies: string[] = [];
    if (locale) cookies.push(serializeLocaleCookie(locale));
    if (theme) cookies.push(serializeThemeCookie(theme));

    const headers = new Headers();
    for (const cookie of cookies) {
      headers.append("Set-Cookie", cookie);
    }

    /**
     * A full redirect (rather than returning JSON) is intentional: changing
     * the locale changes `<html dir>`, which React cannot swap on an already
     * hydrated document without a re-render of every layout. Re-requesting the
     * page lets the server emit the correct direction from the start.
     */
    if (typeof redirectTo === "string" && redirectTo) {
      return redirect(safeRedirect(redirectTo), { headers });
    }

    return data({ success: true }, { headers });
  } catch (cause) {
    const reason = makeShelfError(cause);
    return data(error(reason), { status: reason.status });
  }
}

/** No UI at this route — it exists purely as a form target. */
export function loader() {
  return redirect("/");
}
