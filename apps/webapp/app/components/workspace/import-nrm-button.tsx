import { useTranslation } from "react-i18next";
import { UpgradeMessage } from "../marketing/upgrade-message";
import { Button } from "../shared/button";

export const ImportNrmButton = ({
  canImportNRM,
}: {
  canImportNRM: boolean;
}) => {
  const { t } = useTranslation();

  return (
    <Button
      to={`import-members`}
      variant="secondary"
      role="link"
      className="whitespace-nowrap"
      disabled={
        !canImportNRM
          ? {
              reason: (
                <>
                  {t("team.importNotOnFreeTier")} <UpgradeMessage />
                </>
              ),
            }
          : false
      }
      title={t("common.import")}
    >
      {t("ui.importNrm")}
    </Button>
  );
};
