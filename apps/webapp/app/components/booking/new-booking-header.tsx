/**
 * Shared header data for the "create new booking" routes.
 *
 * Returned from the loaders of `/bookings/new` and its two sibling routes
 * (create-from-asset, create-from-kit) so `Header` has a `header` object to
 * render a breadcrumb/title from.
 *
 * Translated on the server rather than via `useTranslation`: loaders run
 * outside React, so the locale is resolved by the caller (with `getLocale`)
 * and passed in. Keeping the locale as a parameter — instead of importing
 * `i18n.server` here — keeps this module safe for the client bundle.
 *
 * @see {@link file://./../../routes/_layout+/bookings.new.tsx}
 * @see {@link file://./../../i18n/i18n.server.ts}
 */

import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";

/**
 * Builds the localised header for the new-booking routes.
 *
 * @param locale - Locale resolved from the request (`getLocale(request)`)
 * @returns Title and sub-heading in the requested language
 */
export function getNewBookingHeader(locale: string) {
  const resources = locale === "en" ? en : ar;

  return {
    title: resources.bookings.createNewBooking,
    subHeading: resources.bookings.createNewBookingDescription,
  };
}
