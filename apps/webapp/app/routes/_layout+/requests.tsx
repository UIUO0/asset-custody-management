/**
 * Requests queue (الطلبات)
 *
 * Bookings raised by employees that المستودعات have not decided yet. Two roles
 * work this page and they do different jobs:
 *
 * - **المستودعات** (`booking.approve`) accept or reject.
 * - **المخزون** (`booking.hold`) freeze a request for review and release it.
 *   They can never accept or reject one.
 *
 * A frozen request cannot be decided by anyone, which is what makes the hold a
 * control rather than a note. The rule is enforced in the service, not by
 * disabling the button — the disabled button is only the courtesy.
 *
 * @see {@link file://./../../modules/booking/request.server.ts}
 */

import { useState } from "react";
import { BookingApprovalState } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, useLoaderData } from "react-router";
import { z } from "zod";
import { ErrorContent } from "~/components/errors";
import Input from "~/components/forms/input";
import { Dialog, DialogPortal } from "~/components/layout/dialog";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { EmptyTableValue } from "~/components/shared/empty-table-value";
import { UserBadge } from "~/components/shared/user-badge";
import { Table, Td, Th, Tr } from "~/components/table";
import { useDisabled } from "~/hooks/use-disabled";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import type { BookingRequest } from "~/modules/booking/request.server";
import {
  decideBookingRequest,
  getBookingRequests,
  setBookingReviewHold,
} from "~/modules/booking/request.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { payload, error, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { requirePermission } from "~/utils/roles.server";
import { resolveUserDisplayName } from "~/utils/user";

/**
 * Resolves what the caller may do on this page.
 *
 * Reading it requires *either* capability, so the loader asks for `read` (which
 * both roles hold) and derives the two action flags separately. Asking for
 * `approve` up front would 403 المخزون out of a page that exists for them too.
 */
async function requireRequestQueueAccess({
  userId,
  request,
}: {
  userId: string;
  request: Request;
}) {
  const permission = await requirePermission({
    userId,
    request,
    entity: PermissionEntity.booking,
    action: PermissionAction.read,
  });

  const roles = permission.role ? [permission.role] : [];
  const canDecide = userHasPermission({
    roles,
    entity: PermissionEntity.booking,
    action: PermissionAction.approve,
  });
  const canHold = userHasPermission({
    roles,
    entity: PermissionEntity.booking,
    action: PermissionAction.hold,
  });

  if (!canDecide && !canHold) {
    throw new ShelfError({
      cause: null,
      title: "Not allowed",
      message: "You do not have permission to view the requests queue.",
      status: 403,
      additionalData: { userId },
      label: "Booking",
      shouldBeCaptured: false,
    });
  }

  return { ...permission, canDecide, canHold };
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, canDecide, canHold } =
      await requireRequestQueueAccess({ userId, request });

    const url = new URL(request.url);
    const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);

    /**
     * The queue is the pending bucket by design. A decided request is history;
     * it stays reachable from the booking itself, where its note trail lives.
     */
    const { requests, totalRequests } = await getBookingRequests({
      organizationId,
      approvalState: BookingApprovalState.PENDING,
      page,
    });

    return payload({
      /**
       * `<Header/>` renders nothing unless the loader supplies this — it reads
       * `header` straight off the route's loader data rather than taking it as
       * a prop. Without it the page came up with no title bar at all.
       */
      header: { title: "Requests" },
      requests,
      totalRequests,
      page,
      canDecide,
      canHold,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [{ title: appendToMetaTitle(resources.nav.requests) }];
};

/** Form payload for every action on this page. */
const RequestActionSchema = z.object({
  bookingId: z.string().min(1),
  intent: z.enum(["accept", "reject", "hold", "release-hold"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, canDecide, canHold } =
      await requireRequestQueueAccess({ userId, request });

    const formData = await request.formData();
    const { bookingId, intent, reason } = parseData(
      formData,
      RequestActionSchema,
    );

    const isDecision = intent === "accept" || intent === "reject";

    /**
     * Re-check per intent. The two roles see different buttons, but the buttons
     * post to the same action — so المخزون must be refused a decision here even
     * though the UI never offers them one.
     */
    if (isDecision && !canDecide) {
      throw new ShelfError({
        cause: null,
        title: "Not allowed",
        message: "You are not allowed to accept or reject requests.",
        status: 403,
        additionalData: { userId, bookingId, intent },
        label: "Booking",
        shouldBeCaptured: false,
      });
    }

    if (!isDecision && !canHold) {
      throw new ShelfError({
        cause: null,
        title: "Not allowed",
        message: "You are not allowed to put requests on hold.",
        status: 403,
        additionalData: { userId, bookingId, intent },
        label: "Booking",
        shouldBeCaptured: false,
      });
    }

    if (isDecision) {
      await decideBookingRequest({
        id: bookingId,
        organizationId,
        userId,
        decision:
          intent === "accept"
            ? BookingApprovalState.APPROVED
            : BookingApprovalState.REJECTED,
        note: reason,
      });
    } else {
      await setBookingReviewHold({
        id: bookingId,
        organizationId,
        userId,
        hold: intent === "hold",
        reason,
      });
    }

    sendNotification({
      title: "Request updated",
      message: "The request has been updated successfully.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export const ErrorBoundary = () => <ErrorContent />;

export default function RequestsPage() {
  const { t } = useTranslation();
  const { requests, totalRequests, canDecide, canHold } =
    useLoaderData<typeof loader>();

  return (
    <>
      <Header title={t("nav.requests")} hidePageDescription />

      <div className="mt-4 rounded-lg border border-gray-200 bg-white">
        <div className="border-b px-6 py-4">
          <h2 className="text-[16px] font-semibold text-gray-900">
            {t("requests.queueHeading")}
          </h2>
          <p className="mt-1 text-[14px] text-gray-600">
            {t("requests.queueSubheading")}
          </p>
        </div>

        {requests.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[14px] font-medium text-gray-900">
              {t("requests.emptyTitle")}
            </p>
            <p className="mt-1 text-[14px] text-gray-600">
              {t("requests.emptyDescription")}
            </p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("requests.request")}</Th>
                <Th>{t("requests.requestedBy")}</Th>
                <Th>{t("requests.period")}</Th>
                <Th className="text-end">{t("requests.assetCount")}</Th>
                <Th>{t("requests.state")}</Th>
                <Th className="text-end">{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((requestRow) => (
                <RequestRow
                  key={requestRow.id}
                  request={requestRow}
                  canDecide={canDecide}
                  canHold={canHold}
                />
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <p className="mt-3 text-[14px] text-gray-500">
        {t("requests.totalPending", { count: totalRequests })}
      </p>
    </>
  );
}

/** Which dialog, if any, is open for a row. */
type PendingIntent = "reject" | "hold" | null;

/**
 * One request in the queue, with the actions the viewer may take on it.
 *
 * @param request - The request row
 * @param canDecide - Viewer holds `booking.approve`
 * @param canHold - Viewer holds `booking.hold`
 */
function RequestRow({
  request,
  canDecide,
  canHold,
}: {
  request: BookingRequest;
  canDecide: boolean;
  canHold: boolean;
}) {
  const { t } = useTranslation();
  const disabled = useDisabled();
  const [pendingIntent, setPendingIntent] = useState<PendingIntent>(null);

  const isHeld = Boolean(request.reviewHoldAt);
  const requester = request.custodianUser ?? request.creator;
  const requesterName = requester
    ? resolveUserDisplayName(requester) || requester.email
    : request.custodianTeamMember?.name;

  return (
    <>
      <Tr>
        <Td>
          <Button
            to={`/bookings/${request.id}/overview`}
            variant="link"
            className="text-start font-medium text-gray-900 hover:text-gray-700"
          >
            {request.name}
          </Button>
        </Td>

        <Td>
          {requesterName ? (
            <UserBadge
              name={requesterName}
              img={
                (requester && "profilePicture" in requester
                  ? requester.profilePicture
                  : null) ?? "/static/images/default_pfp.jpg"
              }
            />
          ) : (
            <EmptyTableValue />
          )}
        </Td>

        <Td className="whitespace-nowrap">
          <DateS date={request.from} options={{ dateStyle: "short" }} />
          {" – "}
          <DateS date={request.to} options={{ dateStyle: "short" }} />
        </Td>

        <Td className="text-end">{request._count.bookingAssets}</Td>

        <Td>
          {isHeld ? (
            <div className="max-w-[260px]">
              <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
                {t("requests.onHold")}
              </span>
              <p className="mt-1 truncate text-xs text-gray-600">
                {request.reviewHoldReason}
              </p>
            </div>
          ) : (
            <span className="text-gray-600">{t("requests.awaiting")}</span>
          )}
        </Td>

        <Td>
          <div className="flex justify-end gap-2">
            {canDecide ? (
              <>
                <SubmitButton
                  intent="accept"
                  bookingId={request.id}
                  variant="primary"
                  label={t("requests.accept")}
                  /**
                   * A hold freezes the request for everyone, المستودعات
                   * included. The server refuses it too — this only spares the
                   * round-trip and explains why.
                   */
                  disabled={
                    isHeld ? { reason: t("requests.blockedByHold") } : disabled
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    isHeld ? { reason: t("requests.blockedByHold") } : disabled
                  }
                  onClick={() => setPendingIntent("reject")}
                >
                  {t("requests.reject")}
                </Button>
              </>
            ) : null}

            {canHold ? (
              isHeld ? (
                <SubmitButton
                  intent="release-hold"
                  bookingId={request.id}
                  variant="secondary"
                  label={t("requests.releaseHold")}
                  disabled={disabled}
                />
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => setPendingIntent("hold")}
                >
                  {t("requests.hold")}
                </Button>
              )
            ) : null}
          </div>
        </Td>
      </Tr>

      {pendingIntent ? (
        <ReasonDialog
          intent={pendingIntent}
          bookingId={request.id}
          onClose={() => setPendingIntent(null)}
        />
      ) : null}
    </>
  );
}

/** A one-click intent that needs no reason — posted as a plain form. */
function SubmitButton({
  intent,
  bookingId,
  label,
  variant,
  disabled,
}: {
  intent: "accept" | "release-hold";
  bookingId: string;
  label: string;
  variant: "primary" | "secondary";
  disabled: boolean | { reason: string };
}) {
  return (
    <form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <Button type="submit" variant={variant} disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}

/**
 * Collects the mandatory reason for rejecting or holding a request.
 *
 * Both intents stop somebody else's request from moving, so both require a
 * written reason — the service enforces it, this just asks for it up front.
 */
function ReasonDialog({
  intent,
  bookingId,
  onClose,
}: {
  intent: "reject" | "hold";
  bookingId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const disabled = useDisabled();
  const [reason, setReason] = useState("");

  const isReject = intent === "reject";

  return (
    <DialogPortal>
      <Dialog
        open
        onClose={onClose}
        className="sm:max-w-md"
        title={
          <h3 className="text-lg font-semibold">
            {isReject ? t("requests.rejectTitle") : t("requests.holdTitle")}
          </h3>
        }
      >
        <form method="post" className="px-6 py-3 pt-0">
          <input type="hidden" name="intent" value={intent} />
          <input type="hidden" name="bookingId" value={bookingId} />

          <p className="mb-4 text-[14px] text-gray-600">
            {isReject
              ? t("requests.rejectDescription")
              : t("requests.holdDescription")}
          </p>

          <Input
            label={t("requests.reasonLabel")}
            name="reason"
            inputType="textarea"
            rows={3}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              isReject
                ? t("requests.rejectReasonPlaceholder")
                : t("requests.holdReasonPlaceholder")
            }
            className="w-full"
          />

          <div className="mt-4 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={disabled || reason.trim().length === 0}
            >
              {isReject ? t("requests.reject") : t("requests.hold")}
            </Button>
          </div>
        </form>
      </Dialog>
    </DialogPortal>
  );
}
