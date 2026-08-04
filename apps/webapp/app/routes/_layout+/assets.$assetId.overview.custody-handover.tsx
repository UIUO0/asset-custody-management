/**
 * Signed custody handover (محضر تسليم/استرجاع الأصل)
 *
 * One modal covering both directions. The direction is **derived on the server**
 * from whether the asset is currently in someone's custody — in custody means
 * this can only be a return, free means it can only be a handover. It is not a
 * query parameter, because a client-supplied direction is a client-supplied
 * claim about the asset's state, and the service would only have to re-derive it
 * to check.
 *
 * Both parties sign here, on the same device, in a single submit. The custody
 * change itself is applied by
 * {@link file://./../../modules/custody/handover.server.ts `recordHandoverSignature`}
 * inside the transaction that lands the second signature — this route never
 * touches the `Custody` table.
 *
 * @see {@link file://./../../components/custody/signature-pad.tsx}
 * @see {@link file://./../../../../docs/epda-custody-signatures.md}
 */

import { useState } from "react";
import type { Prisma } from "@prisma/client";
import { CustodyHandoverKind, OrganizationRoles } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import SignaturePad from "~/components/custody/signature-pad";
import { Form } from "~/components/custom-form";
import DynamicSelect from "~/components/dynamic-select/dynamic-select";
import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
import { db } from "~/database/db.server";
import { useDisabled } from "~/hooks/use-disabled";
import { getAsset } from "~/modules/asset/service.server";
import { partyFor } from "~/modules/custody/handover";
import {
  openHandover,
  recordHandoverSignature,
  writeHandoverNote,
} from "~/modules/custody/handover.server";
import { getUserByID } from "~/modules/user/service.server";
import styles from "~/styles/layout/custom-modal.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import {
  payload,
  error,
  getCurrentSearchParams,
  getParams,
  parseData,
} from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { tw } from "~/utils/tw";
import { resolveTeamMemberName } from "~/utils/user";

export const meta = () => [{ title: appendToMetaTitle("Custody handover") }];

/**
 * Payload for a two-party, single-session handover.
 *
 * `custodian` arrives as a JSON string from {@link DynamicSelect} so the form
 * carries both the id and the display name in one field — the existing custody
 * modal uses the same shape.
 *
 * The acknowledgement checkboxes are validated as literal `"yes"` rather than
 * as booleans: an unchecked box submits nothing at all, so `z.literal` gives a
 * precise "you did not accept the declaration" instead of a coercion error.
 */
const HandoverFormSchema = z
  .object({
    custodian: z.string().transform((raw, ctx) => {
      try {
        const parsed = JSON.parse(raw) as { id: string; name: string };
        if (!parsed?.id) throw new Error("missing id");
        return parsed;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please select a team member",
        });
        return z.NEVER;
      }
    }),
    conditionNotes: z.string().max(2000).optional(),

    /**
     * `present` — the employee is standing here and signs on this device.
     * `remote`  — only the warehouse signs now; the record waits for the
     *             employee to sign from their own account.
     */
    mode: z.enum(["present", "remote"]),

    warehouseName: z
      .string()
      .min(2, "Please type the warehouse officer's name"),
    warehouseSignature: z
      .string()
      .min(1, "The warehouse signature is required"),
    warehouseAcknowledgement: z.literal("yes", {
      errorMap: () => ({
        message: "The warehouse declaration must be accepted",
      }),
    }),

    // Optional at the field level and required by the refinement below, so the
    // employee's half can be absent in remote mode without three separate
    // schemas to keep in step.
    counterpartyName: z.string().optional(),
    counterpartySignature: z.string().optional(),
    counterpartyAcknowledgement: z.literal("yes").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== "present") return;

    if (!value.counterpartyName || value.counterpartyName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["counterpartyName"],
        message: "Please type the employee's name",
      });
    }
    if (!value.counterpartySignature) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["counterpartySignature"],
        message: "The employee signature is required",
      });
    }
    if (value.counterpartyAcknowledgement !== "yes") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["counterpartyAcknowledgement"],
        message: "The employee declaration must be accepted",
      });
    }
  });

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { assetId } = getParams(params, z.object({ assetId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId, role, userOrganizations } = await requirePermission(
      {
        userId,
        request,
        entity: PermissionEntity.asset,
        action: PermissionAction.custody,
      },
    );

    const asset = await getAsset({
      id: assetId,
      organizationId,
      userOrganizations,
      request,
      include: {
        custody: {
          select: {
            id: true,
            custodian: {
              select: { id: true, name: true, user: { select: { id: true } } },
            },
          },
        },
      },
    });

    const currentCustody = asset?.custody?.[0] ?? null;

    // Direction is a fact about the asset, not a user choice.
    const kind = currentCustody
      ? CustodyHandoverKind.RETURN
      : CustodyHandoverKind.HANDOVER;

    const searchParams = getCurrentSearchParams(request);

    // A self-service employee may only ever be their own counterparty.
    const where = {
      deletedAt: null,
      organizationId,
      userId: role === OrganizationRoles.SELF_SERVICE ? userId : undefined,
    } satisfies Prisma.TeamMemberWhereInput;

    const teamMembers = await db.teamMember.findMany({
      where,
      include: { user: true },
      orderBy: { userId: "asc" },
      take: searchParams.get("getAll") === "teamMember" ? undefined : 12,
    });

    const totalTeamMembers = await db.teamMember.count({ where });

    const operator = await getUserByID(userId, {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
      } satisfies Prisma.UserSelect,
    });

    return payload({
      showModal: true,
      asset,
      kind,
      currentCustody,
      teamMembers,
      totalTeamMembers,
      operatorName:
        [operator.firstName, operator.lastName].filter(Boolean).join(" ") ||
        operator.displayName ||
        "",
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, assetId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request, params }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { assetId } = getParams(params, z.object({ assetId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId, role } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.custody,
    });

    const form = parseData(await request.formData(), HandoverFormSchema, {
      additionalData: { userId, assetId },
      shouldBeCaptured: false,
    });

    // Re-derive the direction server-side rather than trusting the rendered
    // form: the asset may have changed hands in another tab since the modal
    // opened, and `openHandover` would then reject a stale direction anyway.
    const custody = await db.custody.findFirst({
      where: { assetId, asset: { organizationId } },
      select: { teamMemberId: true },
    });
    const kind = custody
      ? CustodyHandoverKind.RETURN
      : CustodyHandoverKind.HANDOVER;

    // A self-service employee may only transact for themselves. Re-checked
    // here and not only in the loader, because the loader's filtered list is a
    // convenience — the id in the POST body is what actually matters.
    if (role === OrganizationRoles.SELF_SERVICE) {
      const own = await db.teamMember.findFirst({
        where: { organizationId, userId, deletedAt: null },
        select: { id: true },
      });
      if (own?.id !== form.custodian.id) {
        throw new Response(null, { status: 403 });
      }
    }

    const handover = await openHandover({
      assetId,
      organizationId,
      kind,
      counterpartyTeamMemberId: form.custodian.id,
      operatorUserId: userId,
      conditionNotes: form.conditionNotes,
    });

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent");

    // Order matters only for readability — the custody change fires on
    // whichever signature lands second, and both are written before this
    // request returns.
    await recordHandoverSignature({
      handoverId: handover.id,
      organizationId,
      party: partyFor(kind, "warehouse"),
      declaredName: form.warehouseName,
      signatureDataUrl: form.warehouseSignature,
      signedByUserId: userId,
      ipAddress,
      userAgent,
    });

    // Remote mode stops here. The record stays AWAITING_SIGNATURES and the
    // custody change does NOT happen — the asset only moves when the employee
    // signs from their own account. Moving it now would be more convenient and
    // less true: the register would show an owner who never agreed to own it.
    if (form.mode === "remote") {
      sendNotification({
        title: "Waiting on the employee",
        message: `Record ${handover.reference} is open. Custody moves once ${form.custodian.name} signs.`,
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });

      return redirect(`/assets/${assetId}/overview`);
    }

    await recordHandoverSignature({
      handoverId: handover.id,
      organizationId,
      party: partyFor(kind, "counterparty"),
      // Non-null by the schema refinement above, which requires both when
      // `mode === "present"`.
      declaredName: form.counterpartyName!,
      signatureDataUrl: form.counterpartySignature!,
      // The employee signs on the operator's device in this flow, so there is
      // no authenticated session for them. The declared name plus the drawn
      // mark is the record; attributing it to the operator's user id would be
      // a lie in the audit trail.
      signedByUserId: null,
      ipAddress,
      userAgent,
    });

    await writeHandoverNote({
      handoverId: handover.id,
      organizationId,
      actorUserId: userId,
    });

    sendNotification({
      title:
        kind === CustodyHandoverKind.HANDOVER
          ? "Handover signed"
          : "Return signed",
      message: `Record ${handover.reference} is complete and both signatures were stored.`,
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return redirect(`/assets/${assetId}/overview`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, assetId });
    return data(error(reason), { status: reason.status });
  }
}

export function links() {
  return [{ rel: "stylesheet", href: styles }];
}

/**
 * The handover modal: counterparty picker, condition notes, and both signature
 * pads on one screen.
 *
 * @returns The rendered modal
 */
export default function CustodyHandover() {
  // `teamMembers` is loaded for DynamicSelect's `initialDataKey`, which reads
  // it off the loader payload directly rather than from a prop.
  const { asset, kind, currentCustody, operatorName } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const disabled = useDisabled();
  const { t } = useTranslation();

  /**
   * Defaults to `present` because the face-to-face desk handover is the common
   * case, and because it is the safer default: it completes the record now
   * instead of leaving one open for someone to chase.
   */
  const [mode, setMode] = useState<"present" | "remote">("present");

  const isReturn = kind === CustodyHandoverKind.RETURN;
  const serverError = actionData?.error?.message;

  return (
    <Form method="post">
      <div className="modal-content-wrapper">
        <div className="mb-5">
          <h4>
            {isReturn
              ? t("custodySignature.returnTitle")
              : t("custodySignature.handoverTitle")}
          </h4>
          <p className="text-gray-600">
            {isReturn
              ? t("custodySignature.returnIntro")
              : t("custodySignature.handoverIntro")}
          </p>
        </div>

        <div className="mb-4 rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-800">
          <span className="font-semibold">{asset?.title}</span>
          {asset?.sequentialId ? (
            <span className="ms-2 text-gray-500">{asset.sequentialId}</span>
          ) : null}
        </div>

        {/* On a return the counterparty is not a choice — it is whoever holds
            the asset. Rendering a picker there would invite an operator to file
            the return against the wrong person. */}
        {isReturn && currentCustody ? (
          <input
            type="hidden"
            name="custodian"
            value={JSON.stringify({
              id: currentCustody.custodian.id,
              name: currentCustody.custodian.name,
            })}
          />
        ) : (
          <div className="relative z-50 mb-6">
            <DynamicSelect
              disabled={disabled}
              model={{ name: "teamMember", queryKey: "name", deletedAt: null }}
              fieldName="custodian"
              contentLabel="Team members"
              initialDataKey="teamMembers"
              countKey="totalTeamMembers"
              placeholder="Select a team member"
              closeOnSelect
              showSearch
              transformItem={(item) => ({
                ...item,
                id: JSON.stringify({
                  id: item.id,
                  name: resolveTeamMemberName(item),
                }),
              })}
              renderItem={(item) => resolveTeamMemberName(item, true)}
            />
          </div>
        )}

        <div className="mb-6">
          <Input
            inputType="textarea"
            name="conditionNotes"
            label={t("custodySignature.conditionNotes")}
            placeholder={t("custodySignature.conditionNotesHint")}
            rows={3}
          />
        </div>

        {/* Mode picker. Radios rather than a checkbox so both options are
            visible and named — a single "employee not present" tick states the
            exception but never states the rule. */}
        <fieldset className="mb-6">
          <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            {t("custodySignature.modeLegend")}
          </legend>
          <div className="grid gap-2 md:grid-cols-2">
            {(
              [
                [
                  "present",
                  "custodySignature.modePresent",
                  "custodySignature.modePresentHint",
                ],
                [
                  "remote",
                  "custodySignature.modeRemote",
                  "custodySignature.modeRemoteHint",
                ],
              ] as const
            ).map(([value, labelKey, hintKey]) => (
              <div
                key={value}
                className={tw(
                  "flex items-start gap-2 rounded-lg border p-3 text-sm",
                  mode === value
                    ? "border-primary-500 bg-primary-50 dark:bg-gray-800"
                    : "border-gray-200 dark:border-gray-700",
                )}
              >
                <input
                  id={`handover-mode-${value}`}
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  disabled={disabled}
                  className="mt-1 size-4 shrink-0"
                  aria-describedby={`handover-mode-${value}-hint`}
                />
                <div>
                  {/* Explicit `htmlFor` rather than wrapping the input: the
                      hint sits outside the label so the accessible name stays
                      the short option title, not title-plus-paragraph. */}
                  <label
                    htmlFor={`handover-mode-${value}`}
                    className="block cursor-pointer font-medium"
                  >
                    {t(labelKey)}
                  </label>
                  <p
                    id={`handover-mode-${value}-hint`}
                    className="text-xs text-gray-500 dark:text-gray-400"
                  >
                    {t(hintKey)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <div
          className={tw(
            "mb-4 grid gap-4",
            mode === "present" && "md:grid-cols-2",
          )}
        >
          <SignaturePad
            imageFieldName="warehouseSignature"
            nameFieldName="warehouseName"
            acknowledgementFieldName="warehouseAcknowledgement"
            title={t("custodySignature.warehouseParty")}
            acknowledgementLabel={
              isReturn
                ? t("custodySignature.acknowledgeReturnWarehouse")
                : t("custodySignature.acknowledgeRelease")
            }
            defaultName={operatorName}
            disabled={disabled}
          />
          {/* Unmounted, not hidden, in remote mode: a hidden pad still submits
              its (empty) fields, and `required` on an invisible checkbox blocks
              submission with a validation bubble the user cannot see. */}
          {mode === "present" ? (
            <SignaturePad
              imageFieldName="counterpartySignature"
              nameFieldName="counterpartyName"
              acknowledgementFieldName="counterpartyAcknowledgement"
              title={t("custodySignature.employeeParty")}
              acknowledgementLabel={
                isReturn
                  ? t("custodySignature.acknowledgeReturnEmployee")
                  : t("custodySignature.acknowledgeReceive")
              }
              defaultName={
                isReturn && currentCustody
                  ? currentCustody.custodian.name
                  : undefined
              }
              disabled={disabled}
            />
          ) : null}
        </div>

        <p className="mb-4 text-sm text-gray-500">
          {mode === "present"
            ? t("custodySignature.passDevice")
            : t("custodySignature.remoteWarning")}
        </p>

        {serverError ? (
          <div className="mb-4 text-sm text-error-500" role="alert">
            {serverError}
          </div>
        ) : null}

        <div className="flex gap-3">
          <Button to=".." variant="secondary" width="full" disabled={disabled}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            width="full"
            type="submit"
            disabled={disabled}
          >
            {mode === "remote"
              ? t("custodySignature.submitRemote")
              : isReturn
              ? t("custodySignature.submitReturn")
              : t("custodySignature.submitHandover")}
          </Button>
        </div>
      </div>
    </Form>
  );
}
