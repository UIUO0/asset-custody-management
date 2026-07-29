import type { CSSProperties } from "react";
import { CopyIcon, PencilIcon, QrCodeIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/shared/button";
import When from "~/components/when/when";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import type { AssetsFromViewItem } from "~/modules/asset/types";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { tw } from "~/utils/tw";
import { CodePreviewDialog } from "../../code-preview/code-preview-dialog";
import { DeleteAsset } from "../delete-asset";

type AssetQuickActionsProps = {
  className?: string;
  style?: CSSProperties;
  asset: Pick<AssetsFromViewItem, "id" | "title" | "mainImage"> & {
    qrId: string;
    sequentialId?: string | null;
  };
};

export default function AssetQuickActions({
  className,
  style,
  asset,
}: AssetQuickActionsProps) {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();

  return (
    <div className={tw("flex items-center gap-2", className)} style={style}>
      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        <Button
          size="sm"
          variant="secondary"
          className={"p-2"}
          to={`/assets/${asset.id}/edit`}
          aria-label={t("assetActions.editAssetInformation")}
          tooltip={t("assetActions.editAssetInformation")}
        >
          <PencilIcon className="size-4" />
        </Button>
      </When>

      <CodePreviewDialog
        item={{
          id: asset.id,
          title: asset.title,
          qrId: asset.qrId,
          type: "asset",
          sequentialId: asset.sequentialId,
        }}
        trigger={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={"p-2"}
            aria-label={t("assetActions.showAssetLabel")}
            tooltip={t("assetActions.showAssetLabel")}
          >
            <QrCodeIcon className="size-4" />
          </Button>
        }
      />

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.update,
        })}
      >
        <Button
          size="sm"
          variant="secondary"
          className={"p-2"}
          to={`/assets/${asset.id}/overview/duplicate`}
          aria-label={t("assetActions.duplicateAsset")}
          tooltip={t("assetActions.duplicateAsset")}
        >
          <CopyIcon className="size-4" />
        </Button>
      </When>

      <When
        truthy={userHasPermission({
          roles,
          entity: PermissionEntity.asset,
          action: PermissionAction.delete,
        })}
      >
        <DeleteAsset
          asset={asset}
          trigger={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={"p-2"}
              aria-label={t("assetActions.deleteAsset")}
              tooltip={t("assetActions.deleteAsset")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
      </When>
    </div>
  );
}
