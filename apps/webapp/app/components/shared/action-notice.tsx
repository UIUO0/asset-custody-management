/**
 * "There is work waiting on you" — one notice, two placements.
 *
 * Coding and approval are a relay between المالية and المستودعات, and each side
 * needs telling twice: once in the sidebar, so they see the backlog without
 * opening anything, and once on the purchase order itself, where they act on
 * it. Rendering both from this component is what keeps the two sentences — and
 * the two visual treatments — from drifting apart.
 *
 * ## Why the count is its own element
 *
 * The number is the thing being scanned for; the sentence is what makes it
 * mean something. Setting the digit at a larger size and heavier weight than
 * the words beside it lets the eye land on "٣" first and read "أصول لم تُرمَّز"
 * second, rather than parsing a uniform line to find the figure inside it.
 *
 * @see {@link file://./../../modules/asset/action-queue.server.ts} the counts
 * @see {@link file://./../layout/sidebar/child-nav-item.tsx} the sidebar placement
 */

import { AlertCircleIcon } from "lucide-react";
import { tw } from "~/utils/tw";

export type ActionNoticeProps = {
  /** How many items are waiting. Rendered as the emphasised figure. */
  count: number;
  /** What they are waiting for, e.g. "أصول لم تُرمَّز بعد". */
  message: string;
  /**
   * `compact` for the sidebar, where the notice sits under a nav entry and must
   * not out-shout the navigation itself; `page` for the in-page banner, which
   * is the first thing read on arriving at an order.
   */
  size?: "compact" | "page";
  className?: string;
};

/**
 * An amber notice naming a backlog the current viewer can act on.
 *
 * Amber rather than red on purpose: this is work queued in the normal course of
 * a delivery, not an error. Red would make an ordinary Tuesday look like a
 * failure, and would spend the colour that should mean "something is wrong".
 *
 * @param props - See {@link ActionNoticeProps}
 */
export function ActionNotice({
  count,
  message,
  size = "page",
  className,
}: ActionNoticeProps) {
  const isCompact = size === "compact";

  return (
    <div
      className={tw(
        "flex items-center gap-3 rounded-lg border border-warning-200 bg-warning-25 text-warning-800",
        isCompact ? "px-3 py-2" : "px-4 py-3.5",
        className,
      )}
    >
      <AlertCircleIcon
        className={tw(
          "shrink-0 text-warning-600",
          isCompact ? "size-4" : "size-5",
        )}
        aria-hidden
      />

      <p className={tw("leading-tight", isCompact ? "text-xs" : "text-sm")}>
        <span
          className={tw(
            "font-semibold text-warning-900",
            isCompact ? "text-sm" : "text-lg",
          )}
        >
          {count}
        </span>{" "}
        {message}
      </p>
    </div>
  );
}
