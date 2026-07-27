import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import type { AssetIndexLoaderData } from "~/routes/_layout+/assets._index";
import { Button } from "../shared/button";

export const ExportBackupButton = ({
  canExportAssets,
}: {
  canExportAssets: boolean;
}) => {
  const { t } = useTranslation();
  const { totalItems } = useLoaderData<AssetIndexLoaderData>();
  return (
    <Button
      to={`/assets/export/assets-${new Date()
        .toISOString()
        .slice(0, 10)}-${new Date().getTime()}.csv`}
      variant="secondary"
      download
      reloadDocument
      disabled={
        !canExportAssets || totalItems === 0
          ? {
              reason:
                totalItems === 0
                  ? t("assets.noAssetsToExportBody")
                  : t("assets.exportNotOnFreeTier"),
            }
          : false
      }
      title={
        totalItems === 0
          ? t("assets.noAssetsToExport")
          : t("assets.exportAssets")
      }
    >
      {t("assets.exportDownloadCsv")}
    </Button>
  );
};
