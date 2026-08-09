/**
 * Renderer for the legacy `{% booking_status %}` Markdoc tag.
 *
 * Bookings are gone, but the notes they wrote are not: asset history rows still
 * contain this tag from every past reservation and check-out, and a Markdoc tag
 * with no renderer breaks the whole note. So the tag stays registered and this
 * component renders the recorded status as plain text.
 *
 * It no longer renders `BookingStatusBadge` — that component was
 * booking-coupled and was deleted with the rest. Historical statuses have no
 * live meaning to colour-code any more; showing the recorded word is enough to
 * keep the sentence readable.
 *
 * @see {@link file://./../../utils/markdoc.config.ts} — where the tag is registered
 */

interface BookingStatusComponentProps {
  /** The status word recorded in the note, e.g. "RESERVED". */
  status: string;
  custodianUserId?: string;
}

export function BookingStatusComponent({
  status,
}: BookingStatusComponentProps) {
  return <span className="font-medium text-gray-700">{status}</span>;
}
