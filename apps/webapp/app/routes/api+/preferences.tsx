/**
 * Appearance preferences endpoint — language.
 *
 * The language switcher posts here. The preference is stored in a readable
 * cookie so the server can render `<html lang/dir>` correctly on the next
 * request. Dark mode is removed ORG-wide, so no theme is handled here.
 *
 * Deliberately unauthenticated: the payload is a display preference tied to
 * the browser, not to a user record, so it must also work on the login screen
 * before a session exists. Values are validated against a fixed enum, so an
 * attacker can only set their own cookie to one of a few harmless constants.
 *
 * @see {@link file://./../../i18n/i18n.server.ts} — locale cookie serialisation
 * @see {@link file://./../../components/layout/appearance-switcher.tsx} — the UI
 */

import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { parseLocale } from "~/i18n/config";
import { serializeLocaleCookie } from "~/i18n/i18n.server";
import { makeShelfError } from "~/utils/error";
import { error, safeRedirect } from "~/utils/http.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();

    // why: dark mode is removed ORG-wide — this endpoint only handles the
    // locale now; the theme form field is ignored if ever posted.
    const locale = parseLocale(String(formData.get("locale") ?? ""));
    const redirectTo = formData.get("redirectTo");

    const headers = new Headers();
    if (locale) headers.append("Set-Cookie", serializeLocaleCookie(locale));

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
