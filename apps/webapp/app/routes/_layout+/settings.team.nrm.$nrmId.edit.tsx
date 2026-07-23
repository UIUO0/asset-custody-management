import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";

import { Form } from "~/components/custom-form";
import Input from "~/components/forms/input";
import { UserIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import { db } from "~/database/db.server";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getTeamMember } from "~/modules/team-member/service.server";
import styles from "~/styles/layout/custom-modal.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { payload, error, getParams, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { NewOrEditMemberSchema } from "./settings.team.nrm.add-member";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  const { nrmId } = getParams(params, z.object({ nrmId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      action: PermissionAction.update,
    });

    const teamMember = await getTeamMember({ id: nrmId, organizationId });

    return payload({ showModal: true, teamMember });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, nrmId });
    throw data(error(reason), { status: reason.status });
  }
}
export const meta = ({
  matches,
}: {
  matches: Array<{ id: string; data?: unknown }>;
}) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [{ title: appendToMetaTitle(resources.team.editMember) }];
};

export async function action({ context, request, params }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  const { nrmId } = getParams(params, z.object({ nrmId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      action: PermissionAction.update,
    });

    const { name } = parseData(await request.formData(), NewOrEditMemberSchema);

    await db.teamMember.update({
      where: { id: nrmId, organizationId },
      data: { name: name.trim() },
    });

    sendNotification({
      title: "Success",
      icon: { name: "success", variant: "success" },
      senderId: userId,
      message: "Name of team member is edited successfully",
    });

    return redirect("/settings/team/nrm");
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, nrmId });
    return data(error(reason), { status: reason.status });
  }
}

export function links() {
  return [{ rel: "stylesheet", href: styles }];
}

export default function EditNrm() {
  const { t } = useTranslation();
  const zo = useZorm("EditMember", NewOrEditMemberSchema);

  const { teamMember } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);

  /** Focus the name field when the modal route mounts (replaces autoFocus). */
  const nameInputRef = useAutoFocus<HTMLInputElement>();

  return (
    <div className="modal-content-wrapper">
      <div className="mb-4 inline-flex size-8 items-center justify-center  rounded-full bg-primary-100 p-2 text-primary-600">
        <UserIcon />
      </div>

      <h4 className="mb-5">{t("team.editMember")}</h4>

      <Form method="post" ref={zo.ref}>
        <Input
          ref={nameInputRef}
          defaultValue={teamMember.name}
          name={zo.fields.name()}
          type="text"
          label={t("team.name")}
          className="mb-8"
          placeholder={t("team.enterMemberName")}
          required
          error={zo.errors.name()?.message}
          disabled={disabled}
        />
        <Button
          variant="primary"
          width="full"
          type="submit"
          disabled={disabled}
        >
          {t("common.save")}
        </Button>
      </Form>
      {actionData?.error && (
        <div className="text-sm text-error-500">{actionData.error.message}</div>
      )}
    </div>
  );
}
