/**
 * الإدارات — the screen that makes a department a row instead of a database edit.
 *
 * A receiving department needs three things written (a desk row, the
 * `DEPARTMENT` role, and the pointer joining them), and until this screen
 * existed all three were writable only by `scripts/seed-demo-users.ts`.
 * `CLAUDE.md` described departments as "data, not code" — but data with no
 * screen is code for anybody who is not holding a psql prompt, and onboarding
 * the authority's third department meant asking a developer.
 *
 * ## Why the role is not in the change-role dialog instead
 *
 * `DEPARTMENT` is deliberately absent from `ASSIGNABLE_ORGANIZATION_ROLES`.
 * Handing it out from that dropdown would set the role and leave the pointer
 * null — `resolveDepartmentDeskId` requires **both** — so the user would appear
 * to be a department representative and see nothing at all, with no error
 * anywhere to say why. The role is only ever granted here, paired with the desk
 * it refers to, in one write.
 *
 * ## The warning that matters
 *
 * A desk with no representative can still be handed a batch, and the resulting
 * محضر has no one able to sign its second half — it sits pending forever. The
 * table says so rather than preventing the state: an authority that cannot
 * revoke somebody's access until it has found their replacement is worse than
 * one that can.
 *
 * @see {@link file://./../../modules/department/service.server.ts}
 * @see {@link file://./../../utils/permissions/role-scope.ts}
 */

import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { Form } from "~/components/custom-form";
import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
import { Table, Td, Th } from "~/components/table";
import { db } from "~/database/db.server";
import { useDisabled } from "~/hooks/use-disabled";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import {
  createDepartmentDesk,
  getDepartmentDesks,
  linkUserToDepartment,
  unlinkUserFromDepartment,
} from "~/modules/department/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { getValidationErrors } from "~/utils/http";
import { error, parseData, payload } from "~/utils/http.server";
import type { DataOrErrorResponse } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.team.departments) }];
};

/** Creating a desk. */
export const NewDepartmentSchema = z.object({
  intent: z.literal("create"),
  name: z
    .string()
    .trim()
    .min(2, "اسم الإدارة مطلوب")
    .max(255, "اسم الإدارة طويل جداً"),
});

/** Granting or revoking one person's authority over a desk. */
const LinkSchema = z.object({
  intent: z.literal("link"),
  userId: z.string().min(1),
  teamMemberId: z.string().min(1, "اختر الإدارة"),
});

const UnlinkSchema = z.object({
  intent: z.literal("unlink"),
  userId: z.string().min(1),
});

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      action: PermissionAction.read,
    });

    const [desks, members] = await Promise.all([
      getDepartmentDesks({ organizationId }),
      /**
       * Candidates for representing a desk: every account in the workspace.
       *
       * Not filtered by role — the seeded admin holds `OWNER` *and* runs the IT
       * desk, so excluding privileged accounts would exclude exactly the
       * arrangement the authority actually uses.
       */
      db.userOrganization.findMany({
        where: { organizationId },
        select: {
          userId: true,
          departmentTeamMemberId: true,
          user: {
            select: { email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { user: { email: "asc" } },
      }),
    ]);

    return payload({
      desks,
      members: members.map((membership) => ({
        userId: membership.userId,
        departmentTeamMemberId: membership.departmentTeamMemberId,
        email: membership.user.email,
        name:
          [membership.user.firstName, membership.user.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || membership.user.email,
      })),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      // Creating a desk and granting the role are both writes to the team, so
      // they sit behind the same gate that guards adding a team member.
      action: PermissionAction.create,
    });

    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "create") {
      const { name } = parseData(formData, NewDepartmentSchema);
      await createDepartmentDesk({ organizationId, name });

      sendNotification({
        title: "تم إنشاء الإدارة",
        message: `أُضيفت «${name}» ويمكن الآن تسليمها دفعات.`,
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });

      return payload({ success: true });
    }

    if (intent === "link") {
      const { userId: targetUserId, teamMemberId } = parseData(
        formData,
        LinkSchema,
      );
      await linkUserToDepartment({
        userId: targetUserId,
        organizationId,
        teamMemberId,
      });

      sendNotification({
        title: "تم الربط",
        message: "يستطيع هذا المستخدم الآن استلام دفعات إدارته وتوقيع محاضرها.",
        icon: { name: "success", variant: "success" },
        senderId: userId,
      });

      return payload({ success: true });
    }

    const { userId: targetUserId } = parseData(formData, UnlinkSchema);
    await unlinkUserFromDepartment({ userId: targetUserId, organizationId });

    sendNotification({
      title: "تم فكّ الربط",
      message: "لم يعد هذا المستخدم يمثّل إدارته.",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function DepartmentsSettings() {
  const { t } = useTranslation();
  const { desks, members } = useLoaderData<typeof loader>();
  const disabled = useDisabled();

  /** Server-side fallback, per CLAUDE.md's form-validation rule. */
  const actionData = useActionData<DataOrErrorResponse>();
  const validationErrors = getValidationErrors<typeof NewDepartmentSchema>(
    actionData?.error,
  );

  return (
    <div className="mt-6">
      <p className="mb-6 text-sm text-gray-600">{t("team.departmentsDesc")}</p>

      <Form method="post" className="mb-8 flex items-end gap-3">
        <input type="hidden" name="intent" value="create" />
        <div className="grow">
          <Input
            label={t("team.departmentName")}
            name="name"
            required
            error={validationErrors?.name?.message}
            inputClassName="w-full"
          />
        </div>
        <Button type="submit" disabled={disabled}>
          {t("team.addDepartment")}
        </Button>
      </Form>

      <Table>
        <thead>
          <tr>
            <Th>{t("team.departmentName")}</Th>
            <Th>{t("team.departmentRepresentatives")}</Th>
            <Th>{t("team.departmentCustody")}</Th>
          </tr>
        </thead>
        <tbody>
          {desks.length === 0 && (
            <tr>
              <Td colSpan={3}>{t("team.noDepartments")}</Td>
            </tr>
          )}
          {desks.map((desk) => (
            <tr key={desk.id}>
              <Td>{desk.name}</Td>
              <Td>
                {desk.representatives.length === 0 ? (
                  // Not decoration: a desk nobody represents can still be handed
                  // a batch, and that محضر can never be signed.
                  <span className="text-error-600">
                    {t("team.departmentNoRepresentative")}
                  </span>
                ) : (
                  <ul>
                    {desk.representatives.map((rep) => (
                      <li
                        key={rep.userId}
                        className="flex items-center gap-2 py-1"
                      >
                        <span>
                          {rep.name}{" "}
                          <span className="text-gray-500">({rep.email})</span>
                        </span>
                        <Form method="post">
                          <input type="hidden" name="intent" value="unlink" />
                          <input
                            type="hidden"
                            name="userId"
                            value={rep.userId}
                          />
                          <Button
                            type="submit"
                            variant="link"
                            disabled={disabled}
                          >
                            {t("team.departmentUnlink")}
                          </Button>
                        </Form>
                      </li>
                    ))}
                  </ul>
                )}
              </Td>
              <Td>{desk.custodyCount}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {desks.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-1 text-[16px] font-semibold">
            {t("team.departmentAssign")}
          </h3>
          <p className="mb-4 text-sm text-gray-600">
            {t("team.departmentAssignDesc")}
          </p>

          <Form method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="link" />
            <div>
              <label
                className="mb-1 block font-medium"
                htmlFor="department-user"
              >
                {t("team.departmentUser")}
              </label>
              <select
                id="department-user"
                name="userId"
                required
                className="rounded border border-gray-300 px-3 py-2"
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium" htmlFor="department-id">
                {t("team.department")}
              </label>
              <select
                id="department-id"
                name="teamMemberId"
                required
                className="rounded border border-gray-300 px-3 py-2"
              >
                {desks.map((desk) => (
                  <option key={desk.id} value={desk.id}>
                    {desk.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={disabled}>
              {t("team.departmentLink")}
            </Button>
          </Form>
        </div>
      )}
    </div>
  );
}
