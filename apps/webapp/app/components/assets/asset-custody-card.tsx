import type { User } from "@prisma/client";
import { Trans, useTranslation } from "react-i18next";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { getPrimaryCustody } from "~/modules/custody/utils";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { tw } from "~/utils/tw";
import { resolveTeamMemberName } from "~/utils/user";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import { DateS } from "../shared/date";

/**
 * Renders the Asset Custody Card — who currently holds the asset, and since
 * when.
 *
 * Custody is the only path here: the booking variant of this card was dropped
 * with the booking system itself (EPDA runs on handover/custody records only).
 */
export function CustodyCard({
  hasPermission,
  custody,
  className,
}: {
  hasPermission: boolean;
  custody:
    | {
        createdAt: Date;
        custodian: {
          id: string;
          name: string;
          userId?: string | null;
          user?: Partial<
            Pick<User, "firstName" | "lastName" | "profilePicture" | "email">
          > | null;
        };
      }[]
    | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();
  const canViewTeamMemberUsers = userHasPermission({
    roles,
    entity: PermissionEntity.teamMemberProfile,
    action: PermissionAction.read,
  });

  /** Extract the primary custody record from the array */
  const primaryCustody = getPrimaryCustody(custody);

  /** We return null if user is selfService or if no custody exists */
  if (!hasPermission || !primaryCustody) {
    return <div className="my-3" />;
  }

  const fullName = primaryCustody
    ? resolveTeamMemberName(primaryCustody.custodian)
    : "";

  /* If custody is present, we render the card showing custody */
  if (primaryCustody?.createdAt) {
    return (
      <Card className={tw("my-[14px]", className)}>
        <div className="flex items-center gap-3">
          <img
            src={
              primaryCustody.custodian?.user?.profilePicture ||
              "/static/images/default_pfp.jpg"
            }
            alt={t("ui.custodian")}
            className="size-10 rounded"
          />
          <div>
            <p className="">
              {t("ui.inCustodyOf")}{" "}
              {canViewTeamMemberUsers && primaryCustody?.custodian?.userId ? (
                <Button
                  to={`/settings/team/users/${primaryCustody.custodian.userId}/assets`}
                  variant="link"
                  className={tw(
                    "mt-px font-semibold text-gray-900 hover:text-gray-700 hover:underline",
                    "[&_.external-link-icon]:opacity-0 [&_.external-link-icon]:duration-100 [&_.external-link-icon]:ease-in-out [&_.external-link-icon]:hover:opacity-100",
                  )}
                  target="_blank"
                >
                  {fullName}
                </Button>
              ) : (
                <span className="mt-px">{fullName}</span>
              )}
              <span className="font-semibold">{}</span>
            </p>
            <span>
              <Trans
                i18nKey="ui.custodySince"
                components={{
                  1: <DateS date={primaryCustody.createdAt} includeTime />,
                }}
              />
            </span>
          </div>
        </div>
      </Card>
    );
  }

  return null;
}
