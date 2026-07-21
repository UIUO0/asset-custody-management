/**
 * Text-direction helpers for components that need a *physical* side.
 *
 * Most layout mirrors automatically via CSS logical properties (`ms-`, `pe-`,
 * `text-start`, …). But some third-party APIs — notably Radix's `side` prop on
 * popovers, dropdowns, and tooltips — take a physical side and cannot express
 * "start"/"end". Those call sites use {@link useInlineEndSide} so a menu that
 * opens to the right in English opens to the left in Arabic.
 *
 * @see {@link file://./../i18n/config.ts} — where direction is derived from locale
 */

import { useRouteLoaderData } from "react-router";
import { DEFAULT_LOCALE, getDirection } from "~/i18n/config";
import type { loader as rootLoader } from "~/root";

/**
 * The active text direction.
 *
 * @returns "rtl" while the interface is Arabic, "ltr" otherwise
 */
export function useDirection(): "rtl" | "ltr" {
  const data = useRouteLoaderData<typeof rootLoader>("root");
  return data?.dir ?? getDirection(DEFAULT_LOCALE);
}

/** True while the interface is right-to-left. */
export function useIsRtl(): boolean {
  return useDirection() === "rtl";
}

/**
 * The physical side corresponding to the *inline end* of the current
 * direction — i.e. the side a flyout should open toward.
 *
 * @returns "left" in RTL, "right" in LTR
 */
export function useInlineEndSide(): "left" | "right" {
  return useIsRtl() ? "left" : "right";
}

/**
 * The physical side corresponding to the *inline start* of the current
 * direction.
 *
 * @returns "right" in RTL, "left" in LTR
 */
export function useInlineStartSide(): "left" | "right" {
  return useIsRtl() ? "right" : "left";
}
