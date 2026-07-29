import type { CSSProperties } from "react";
import type { Kit } from "@prisma/client";
import { PencilIcon, QrCodeIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { tw } from "~/utils/tw";
import DeleteKit from "./delete-kit";
import { CodePreviewDialog } from "../code-preview/code-preview-dialog";
import { Button } from "../shared/button";
import When from "../when/when";

type KitQuickActionsProps = {
  className?: string;
  style?: CSSProperties;
  kit: Kit & { qrId: string };
};

export default function KitQuickActions({
  className,
  style,
  kit,
}: KitQuickActionsProps) {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();

  return (
    <div className={tw("flex items-center gap-2", className)} style={style}>
      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.kit,
          action: PermissionAction.update,
        })}
      >
        <Button
          size="sm"
          variant="secondary"
          className={"p-2"}
          to={`/kits/${kit.id}/edit`}
          aria-label={t("ui.editKitInformation")}
          tooltip={t("ui.editKitInformation")}
        >
          <PencilIcon className="size-4" />
        </Button>
      </When>

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.qr,
          action: PermissionAction.read,
        })}
      >
        <CodePreviewDialog
          item={{
            id: kit.id,
            name: kit.name,
            qrId: kit.qrId,
            type: "kit",
          }}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="p-2"
              aria-label={t("ui.showKitCodes")}
              tooltip={t("ui.showKitCodes")}
            >
              <QrCodeIcon className="size-4" />
            </Button>
          }
        />
      </When>

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.kit,
          action: PermissionAction.delete,
        })}
      >
        <DeleteKit
          kit={kit}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={"p-2"}
              aria-label={t("ui.deleteKit")}
              tooltip={t("ui.deleteKit")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
      </When>
    </div>
  );
}
