import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import type { MetaFunction } from "react-router";
import { data } from "react-router";
import { z } from "zod";

import { AuditNotes } from "~/components/audit/notes";
import { NoPermissionsIcon } from "~/components/icons/library";
import TextualDivider from "~/components/shared/textual-divider";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getAuditNotes } from "~/modules/audit/note-service.server";
import {
  getAuditSessionDetails,
  requireAuditAssigneeForBaseSelfService,
} from "~/modules/audit/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { error, getParams, payload } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [
    {
      title: data
        ? appendToMetaTitle(data.header.title)
        : resources.audits.activityTitle,
    },
  ];
};

export const handle = {
  breadcrumb: () => "Activity",
};

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  const { auditId } = getParams(params, z.object({ auditId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const permissionResult = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.audit,
      action: PermissionAction.read,
    });

    const { organizationId, userOrganizations, isScopedToOwnRecords } =
      permissionResult;

    const { session } = await getAuditSessionDetails({
      id: auditId,
      organizationId,
      userOrganizations,
      request,
    });

    requireAuditAssigneeForBaseSelfService({
      audit: session,
      userId,
      isScopedToOwnRecords,
      auditId,
    });

    // Fetch audit notes
    const notes = await getAuditNotes({
      auditSessionId: auditId,
    });

    const header = { title: `${session.name} · Activity` };

    return data(
      payload({
        session: { ...session, notes },
        header,
      }),
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, auditId, label: "Audit" });
    throw data(error(reason), { status: reason.status });
  }
}

export default function AuditActivity() {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();
  const canReadAuditNotes = userHasPermission({
    roles,
    entity: PermissionEntity.auditNote,
    action: PermissionAction.read,
  });

  return (
    <div className="w-full">
      {canReadAuditNotes ? (
        <>
          <TextualDivider
            text={t("bookings.tabActivity")}
            className="mb-8 lg:hidden"
          />
          <AuditNotes />
        </>
      ) : (
        <div className="flex h-full flex-col justify-center">
          <div className="flex flex-col items-center justify-center  text-center">
            <div className="mb-4 inline-flex size-8 items-center justify-center  rounded-full bg-primary-100 p-2 text-primary-600">
              <NoPermissionsIcon />
            </div>
            <h5>{t("team.insufficientPermissions")}</h5>
            <p>{t("ui.youAreNotAllowedToViewAuditActivity")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
