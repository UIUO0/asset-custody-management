import { useTranslation } from "react-i18next";
import { UpgradeMessage } from "../marketing/upgrade-message";
import { Button } from "../shared/button";

export const ImportButton = ({
  canImportAssets,
}: {
  canImportAssets: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <Button
      to={`import`}
      variant="secondary"
      role="link"
      disabled={
        !canImportAssets
          ? {
              reason: (
                <>
                  Importing is not available on the free tier of shelf.{" "}
                  <UpgradeMessage />
                </>
              ),
            }
          : false
      }
      title={t("assets.importTitle")}
    >
      {t("common.import")}
    </Button>
  );
};
