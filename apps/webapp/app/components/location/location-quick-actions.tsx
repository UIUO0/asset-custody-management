import type { CSSProperties } from "react";
import type { Location } from "@prisma/client";
import { MapIcon, PencilIcon, QrCodeIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { tw } from "~/utils/tw";
import { DeleteLocation } from "./delete-location";
import { Button } from "../shared/button";
import When from "../when/when";

type LocationQuickActionsProps = {
  className?: string;
  style?: CSSProperties;
  location: Pick<Location, "id" | "name"> & { childCount?: number };
};

export default function LocationQuickActions({
  className,
  style,
  location,
}: LocationQuickActionsProps) {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();

  const canUpdate = userHasPermission({
    roles,
    entity: PermissionEntity.location,
    action: PermissionAction.update,
  });

  const canDelete = userHasPermission({
    roles,
    entity: PermissionEntity.location,
    action: PermissionAction.delete,
  });

  const canManageAssets = userHasPermission({
    roles,
    entity: PermissionEntity.location,
    action: PermissionAction.update,
  });

  return (
    <div className={tw("flex items-center gap-2", className)} style={style}>
      <When truthy={canUpdate}>
        <Button
          size="sm"
          variant="secondary"
          className="p-2"
          to={`/locations/${location.id}/edit`}
          aria-label={t("locations.editTitle")}
          tooltip={t("locations.editTitle")}
        >
          <PencilIcon className="size-4" />
        </Button>
      </When>

      <When truthy={canManageAssets}>
        <Button
          size="sm"
          variant="secondary"
          className="p-2"
          to={`/locations/${location.id}/assets/manage-assets`}
          aria-label={t("ui.manageLocationAssets")}
          tooltip={t("ui.manageLocationAssets")}
        >
          <MapIcon className="size-4" />
        </Button>
      </When>

      <When truthy={canManageAssets}>
        <Button
          size="sm"
          variant="secondary"
          className="p-2"
          to={`/locations/${location.id}/scan-assets`}
          aria-label={t("ui.scanAssets")}
          tooltip={t("ui.scanAssets")}
        >
          <QrCodeIcon className="size-4" />
        </Button>
      </When>

      <When truthy={canDelete}>
        <DeleteLocation
          location={{
            ...location,
            childCount: location.childCount,
          }}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="p-2"
              aria-label={t("ui.deleteLocation")}
              tooltip={t("ui.deleteLocation")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
      </When>
    </div>
  );
}
