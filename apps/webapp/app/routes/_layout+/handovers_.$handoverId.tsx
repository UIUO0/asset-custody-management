/**
 * Sign a handover record (توقيع محضر)
 *
 * The remote half of the signing flow: the warehouse signed at the desk, the
 * employee signs here from their own account. Also serves as the read-only
 * view of a record for anyone who may see it but not sign it.
 *
 * ## Why the trailing underscore in the filename
 *
 * `remix-flat-routes` nests on the dot: named `handovers.$handoverId.tsx`, this
 * becomes a *child* of `handovers.tsx`, which then has to render an `<Outlet />`
 * for it to appear at all. It silently did not — clicking "sign" navigated
 * correctly and kept showing the list, because the parent rendered and the
 * child had nowhere to go.
 *
 * The `handovers_` suffix opts out of that nesting. This is a full page, not a
 * panel inside the queue, so a flat sibling route is what it should have been.
 *
 * ## The one rule this page exists to enforce
 *
 * A user may only sign the slot that {@link resolveSignableParty} grants them,
 * and the employee's slot is bound to *their own team-member row*. Without
 * that binding, remote signing would be strictly worse than no signing at all:
 * an operator could open a record naming any employee and then sign both
 * halves from their own account, producing a محضر that looks fully executed
 * and is entirely fabricated.
 *
 * The check runs in the `action`, on the server, against the session — never
 * against a party id submitted with the form.
 *
 * @see {@link file://./handovers.tsx} — the queue this is reached from
 * @see {@link file://./../../modules/custody/handover.server.ts}
 */

import type { Prisma } from "@prisma/client";
import { CustodyHandoverKind, CustodyHandoverState } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import SignaturePad from "~/components/custody/signature-pad";
import { Form } from "~/components/custom-form";
import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { db } from "~/database/db.server";
import { useDisabled } from "~/hooks/use-disabled";
// Neutral module: the component below renders from `partyFor`, so it must not
// come from a `.server` file. See `~/modules/custody/handover.ts`.
import { partyFor, resolveSignableParty } from "~/modules/custody/handover";
import {
  getHandover,
  recordHandoverSignature,
  resolveOwnDepartmentId,
  signatureImageUrls,
  writeHandoverNote,
} from "~/modules/custody/handover.server";
import { getUserByID } from "~/modules/user/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { payload, error, getParams, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { rolesAreScopedToOwnRecords } from "~/utils/permissions/role-scope";
import { requirePermission } from "~/utils/roles.server";

export const meta = () => [{ title: appendToMetaTitle("Sign handover") }];

/** Payload for a single party's signature. */
const SignFormSchema = z.object({
  signerName: z.string().min(2, "Please type your full name"),
  signature: z.string().min(1, "A signature is required"),
  acknowledgement: z.literal("yes", {
    errorMap: () => ({ message: "The declaration must be accepted" }),
  }),
});

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { handoverId } = getParams(
    params,
    z.object({ handoverId: z.string() }),
    { additionalData: { userId } },
  );

  try {
    /**
     * `asset.read`, not `asset.custody` — see the note in `handovers.tsx`.
     * `BASE` employees hold custody without holding the permission that
     * manages other people's custody, and gating on it would lock them out of
     * signing their own محاضر.
     *
     * The actual authorization is per record: the scope check below, and
     * {@link resolveSignableParty} for which slot may be signed.
     */
    const { organizationId, role } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    const handover = await getHandover({ handoverId, organizationId });

    const [ownMember, ownDepartmentTeamMemberId] = await Promise.all([
      db.teamMember.findFirst({
        where: { organizationId, userId, deletedAt: null },
        select: { id: true },
      }),
      // A batch محضر names the department desk, so a department officer's
      // *personal* row never matches it. Resolved from their own membership.
      resolveOwnDepartmentId({ userId, organizationId }),
    ]);

    const scopedToOwnRecords = rolesAreScopedToOwnRecords(role);

    // The rows this viewer can legitimately be named on: their own, and their
    // department's desk.
    const ownCounterpartyIds = [
      ownMember?.id,
      ownDepartmentTeamMemberId,
    ].filter((id): id is string => Boolean(id));

    // An employee must not be able to read a محضر about somebody else by
    // guessing an id. Operators see the whole workspace because chasing stuck
    // records is their job.
    if (
      scopedToOwnRecords &&
      !ownCounterpartyIds.includes(handover.counterpartyTeamMemberId)
    ) {
      throw new ShelfError({
        cause: null,
        title: "Handover not found",
        message: "This handover record does not exist in your workspace.",
        additionalData: { handoverId },
        label: "Custody",
        status: 404,
        shouldBeCaptured: false,
      });
    }

    // Two different questions, deliberately asked with two different tools
    // (CLAUDE.md): `rolesAreScopedToOwnRecords` answers *which records* the
    // viewer may see; `userHasPermission` answers *what they may do*. Signing
    // as the warehouse desk is a capability, so it is the second one.
    const signableParty = resolveSignableParty({
      handover,
      canOperate: userHasPermission({
        roles: [role],
        entity: PermissionEntity.asset,
        action: PermissionAction.custody,
      }),
      ownTeamMemberId: ownMember?.id ?? null,
      ownDepartmentTeamMemberId,
    });

    const viewer = await getUserByID(userId, {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
      } satisfies Prisma.UserSelect,
    });

    const header: HeaderData = { title: handover.reference };

    return payload({
      header,
      handover,
      signableParty,
      // Completed records show the marks; open ones have nothing to show yet
      // and minting URLs for them would leak a half-signed محضر into a link.
      signatureUrls:
        handover.state === CustodyHandoverState.COMPLETED
          ? await signatureImageUrls(handover.signatures)
          : {},
      viewerName:
        [viewer.firstName, viewer.lastName].filter(Boolean).join(" ") ||
        viewer.displayName ||
        "",
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, handoverId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request, params }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { handoverId } = getParams(
    params,
    z.object({ handoverId: z.string() }),
    { additionalData: { userId } },
  );

  try {
    /**
     * `asset.read`, not `asset.custody` — see the note in `handovers.tsx`.
     * `BASE` employees hold custody without holding the permission that
     * manages other people's custody, and gating on it would lock them out of
     * signing their own محاضر.
     *
     * The actual authorization is per record: the scope check below, and
     * {@link resolveSignableParty} for which slot may be signed.
     */
    const { organizationId, role } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    const form = parseData(await request.formData(), SignFormSchema, {
      additionalData: { userId, handoverId },
      shouldBeCaptured: false,
    });

    const handover = await getHandover({ handoverId, organizationId });

    const [ownMember, ownDepartmentTeamMemberId] = await Promise.all([
      db.teamMember.findFirst({
        where: { organizationId, userId, deletedAt: null },
        select: { id: true },
      }),
      resolveOwnDepartmentId({ userId, organizationId }),
    ]);

    // The party is derived from the session, never read from the form. A
    // submitted party field would be the caller telling us who they are.
    const party = resolveSignableParty({
      handover,
      canOperate: userHasPermission({
        roles: [role],
        entity: PermissionEntity.asset,
        action: PermissionAction.custody,
      }),
      ownTeamMemberId: ownMember?.id ?? null,
      ownDepartmentTeamMemberId,
    });

    // Re-check the read scope on write too. The loader's 404 hides other
    // people's records from the UI; without this an employee could POST
    // against a guessed id and have `resolveSignableParty` be the only thing
    // standing between them and someone else's محضر.
    //
    // Both rows count, exactly as in the loader — a department officer is
    // named through their desk, never their personal row.
    const ownCounterpartyIds = [
      ownMember?.id,
      ownDepartmentTeamMemberId,
    ].filter((id): id is string => Boolean(id));

    if (
      rolesAreScopedToOwnRecords(role) &&
      !ownCounterpartyIds.includes(handover.counterpartyTeamMemberId)
    ) {
      throw new ShelfError({
        cause: null,
        title: "Handover not found",
        message: "This handover record does not exist in your workspace.",
        additionalData: { handoverId, userId },
        label: "Custody",
        status: 404,
        shouldBeCaptured: false,
      });
    }

    if (!party) {
      throw new ShelfError({
        cause: null,
        title: "Not your signature to give",
        message:
          "You are not a party to this handover, or your side has already been signed.",
        additionalData: { handoverId, userId },
        label: "Custody",
        status: 403,
        shouldBeCaptured: false,
      });
    }

    const updated = await recordHandoverSignature({
      handoverId,
      organizationId,
      party,
      declaredName: form.signerName,
      signatureDataUrl: form.signature,
      // Unlike the desk flow, this signature *does* carry a user id: the
      // signatory authenticated as themselves to get here, which is the whole
      // evidentiary advantage of remote signing over passing a device around.
      signedByUserId: userId,
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    if (updated.state === CustodyHandoverState.COMPLETED) {
      await writeHandoverNote({
        handoverId,
        organizationId,
        actorUserId: userId,
      });

      sendNotification({
        title: "Handover complete",
        message: `Record ${handover.reference} is signed by both parties.`,
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });

      // A batch محضر has no single asset to land on, so send the operator back
      // to the record they just completed rather than to an arbitrary line.
      return redirect(
        handover.assets.length === 1
          ? `/assets/${handover.assets[0].asset.id}/overview`
          : `/handovers/${handover.id}`,
      );
    }

    sendNotification({
      title: "Signature recorded",
      message: "Waiting on the other party to sign.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return redirect("/handovers");
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, handoverId });
    return data(error(reason), { status: reason.status });
  }
}

/**
 * The single-record signing page.
 *
 * @returns The rendered page
 */
export default function SignHandover() {
  const { handover, signableParty, viewerName } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const disabled = useDisabled();
  const { t } = useTranslation();

  const isReturn = handover.kind === CustodyHandoverKind.RETURN;
  const counterpartySlot = partyFor(handover.kind, "counterparty");
  const signingAsEmployee = signableParty === counterpartySlot;
  const serverError = actionData?.error?.message;

  return (
    <>
      <Header />

      <div className="mt-4 max-w-2xl rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <h3 className="mb-1">
          {isReturn
            ? t("custodySignature.returnTitle")
            : t("custodySignature.handoverTitle")}
        </h3>

        <dl className="mb-5 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">{t("custodySignature.reference")}</dt>
          <dd className="font-mono">{handover.reference}</dd>

          <dt className="text-gray-500">{t("assets.asset")}</dt>
          <dd>
            {handover.assets.length === 1 ? (
              <>
                {handover.assets[0].asset.title}
                {handover.assets[0].asset.type === "QUANTITY_TRACKED" ? (
                  <span className="ms-2 font-medium">
                    ×&nbsp;{handover.assets[0].quantity}
                  </span>
                ) : null}
              </>
            ) : (
              // Every line is printed, not a count: this is the document the
              // signatory is agreeing to, and "12 assets" is not something a
              // person can sign for.
              <ul className="list-inside list-disc space-y-0.5">
                {handover.assets.map((line) => (
                  <li key={line.asset.id}>
                    {line.asset.title}
                    {/* Quantity-tracked lines carry a count; individual ones
                        are one thing and "× 1" would be noise on every row. */}
                    {line.asset.type === "QUANTITY_TRACKED" ? (
                      <span className="ms-2 font-medium">
                        ×&nbsp;{line.quantity}
                      </span>
                    ) : null}
                    {line.asset.sequentialId ? (
                      <span className="ms-1 font-mono text-xs text-gray-500">
                        {line.asset.sequentialId}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </dd>

          <dt className="text-gray-500">
            {t("custodySignature.employeeParty")}
          </dt>
          <dd>{handover.counterparty.name}</dd>

          <dt className="text-gray-500">{t("common.date")}</dt>
          <dd>
            <DateS date={handover.createdAt} />
          </dd>
        </dl>

        {/* Reason first, condition second: the warehouse reads "why is this
            coming back" before "what state is it in". */}
        {handover.requestReason ? (
          <div className="mb-3 rounded-md bg-warning-50 p-3 text-sm dark:bg-gray-800">
            <span className="mb-1 block font-medium">
              {t("myCustody.returnReason")}
            </span>
            {handover.requestReason}
          </div>
        ) : null}

        {handover.conditionNotes ? (
          <div className="mb-5 rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-800">
            <span className="mb-1 block font-medium">
              {t("custodySignature.conditionNotes")}
            </span>
            {handover.conditionNotes}
          </div>
        ) : null}

        <ul className="mb-5 space-y-1 text-sm">
          {handover.signatures.map((signature) => (
            <li key={signature.id} className="text-gray-600 dark:text-gray-300">
              ✓ {signature.declaredName} — {t("custodySignature.signedAt")}{" "}
              <DateS date={signature.signedAt} includeTime />
            </li>
          ))}
        </ul>

        {signableParty ? (
          <Form method="post">
            <SignaturePad
              imageFieldName="signature"
              nameFieldName="signerName"
              acknowledgementFieldName="acknowledgement"
              title={
                signingAsEmployee
                  ? t("custodySignature.employeeParty")
                  : t("custodySignature.warehouseParty")
              }
              acknowledgementLabel={
                isReturn
                  ? signingAsEmployee
                    ? t("custodySignature.acknowledgeReturnEmployee")
                    : t("custodySignature.acknowledgeReturnWarehouse")
                  : signingAsEmployee
                  ? t("custodySignature.acknowledgeReceive")
                  : t("custodySignature.acknowledgeRelease")
              }
              defaultName={viewerName}
              disabled={disabled}
              error={serverError}
            />

            <div className="mt-4 flex gap-3">
              <Button
                to="/handovers"
                variant="secondary"
                width="full"
                disabled={disabled}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                width="full"
                disabled={disabled}
              >
                {t("custodySignature.signNow")}
              </Button>
            </div>
          </Form>
        ) : (
          <p className="text-sm text-gray-500">
            {handover.state === CustodyHandoverState.COMPLETED
              ? t("custodySignature.completed")
              : t("custodySignature.notYourSignature")}
          </p>
        )}
      </div>
    </>
  );
}
