import { useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useActionData, useNavigation } from "react-router";
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
import styles from "~/styles/layout/custom-modal.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { payload, error, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
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
  return [{ title: appendToMetaTitle(resources.team.addMember) }];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      action: PermissionAction.create,
    });

    return payload({
      showModal: true,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const NewOrEditMemberSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      action: PermissionAction.create,
    });

    const payload = parseData(await request.formData(), NewOrEditMemberSchema);

    const { name } = payload;

    await db.teamMember.create({
      data: {
        name: name.trim(),
        organizationId,
      },
    });

    sendNotification({
      title: "Successfully added a new team member",
      message: "You are now able to give this team member custody over assets.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return redirect(`/settings/team/nrm`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export function links() {
  return [{ rel: "stylesheet", href: styles }];
}

export default function AddMember() {
  const { t } = useTranslation();
  const zo = useZorm("NewMember", NewOrEditMemberSchema);

  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);

  /** Focus the name field when the modal route mounts (replaces autoFocus). */
  const nameInputRef = useAutoFocus<HTMLInputElement>();

  return (
    <>
      <div className="modal-content-wrapper">
        <div className="mb-4 inline-flex size-8 items-center justify-center  rounded-full bg-primary-100 p-2 text-primary-600">
          <UserIcon />
        </div>
        <div className="mb-5">
          <h4>{t("team.addMember")}</h4>
          <p>{t("team.addMemberDesc")}</p>
        </div>
        <Form method="post" ref={zo.ref}>
          <Input
            ref={nameInputRef}
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
            {t("team.addMember")}
          </Button>
        </Form>
        {actionData?.error && (
          <div className="text-sm text-error-500">
            {actionData.error.message}
          </div>
        )}
      </div>
    </>
  );
}
