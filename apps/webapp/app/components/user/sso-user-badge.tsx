import { useTranslation } from "react-i18next";
import { GrayBadge } from "../shared/gray-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../shared/tooltip";

export const SSOUserBadge = ({
  userId,
  sso,
}: {
  userId: string;
  sso: boolean;
}) => {
  const { t } = useTranslation();
  if (!sso) return null;

  return (
    <TooltipProvider key={userId}>
      <Tooltip>
        <TooltipTrigger>
          <GrayBadge className="ms-2">SSO</GrayBadge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72">
          <h4>{t("ui.ssoUser")}</h4>

          <p className="mt-2">{t("team.ssoUserHint")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
