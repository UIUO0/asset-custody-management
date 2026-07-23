import { useTranslation } from "react-i18next";

/** A single recipient entry for the notification preview. */
type PreviewRecipient = {
  /** Stable identifier for removable items (team member ID for booking_recipient) */
  id?: string;
  name: string;
  /** One of the keys in {@link reasonLabels} (e.g. "custodian", "creator"). */
  reason: string;
};

type NotificationPreviewProps = {
  recipients: PreviewRecipient[];
  adminCount: number;
  notifyAdminsOnNewBooking: boolean;
  /** Called when a removable recipient is removed via the X button.
   *  Currently booking_recipient and always_notify items are removable. */
  onRemoveRecipient?: (id: string) => void;
};

/**
 * Read-only preview of all notification recipients for a booking.
 *
 * Lists each recipient with their reason (custodian, creator, always-notify,
 * per-booking). The admin count is shown separately as a footnote because
 * admins are only notified on the initial reservation event, not on
 * subsequent booking lifecycle changes (checkout, checkin, etc.).
 *
 * Visibility is privacy-gated by the parent component — this component
 * itself does not check the user's role.
 */
export function NotificationPreview({
  recipients,
  adminCount,
  notifyAdminsOnNewBooking,
  onRemoveRecipient,
}: NotificationPreviewProps) {
  const { t } = useTranslation();

  /**
   * Maps internal reason codes to human-readable labels displayed next to each
   * recipient name in the preview list.
   */
  const reasonLabels: Record<string, string> = {
    custodian: t("bookings.reasonCustodian"),
    creator: t("bookings.reasonCreator"),
    always_notify: t("bookings.reasonAlwaysNotify"),
    booking_recipient: t("bookings.reasonBookingRecipient"),
  };

  if (recipients.length === 0 && adminCount === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
      <p className="mb-2 text-[14px] font-medium text-gray-700">
        {t("bookings.whoWillBeNotified")}
      </p>
      <ul className="space-y-1">
        {recipients.map((r) => (
          <li
            key={`${r.id || r.name}-${r.reason}`}
            className="flex items-center justify-between text-[13px] text-gray-600"
          >
            <span>
              <span className="font-medium text-gray-700">{r.name}</span>
              <span className="ms-1 text-gray-400">
                — {reasonLabels[r.reason] || r.reason}
              </span>
            </span>
            {(r.reason === "booking_recipient" ||
              r.reason === "always_notify") &&
            r.id &&
            onRemoveRecipient ? (
              <button
                type="button"
                className="ms-2 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                onClick={() => onRemoveRecipient(r.id!)}
                aria-label={t("bookings.removeRecipient", { name: r.name })}
              >
                <svg
                  className="size-3"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {notifyAdminsOnNewBooking ? (
        <p className="mt-1 text-[13px] text-gray-500">
          {adminCount > 0
            ? t("bookings.adminsNotifiedCount", { count: adminCount })
            : t("bookings.adminsNotified")}
        </p>
      ) : null}
    </div>
  );
}
