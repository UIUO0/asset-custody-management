import { useTranslation } from "react-i18next";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { useUserData } from "~/hooks/use-user-data";
import { CustomerPortalForm } from "./customer-portal-form";
import { plansIconsMap } from "./price-box";
import { Button } from "../shared/button";

export const NoSubscription = () => {
  const { t } = useTranslation();
  const currentOrganization = useCurrentOrganization();
  const user = useUserData();

  const userIsOwner = user?.id === currentOrganization?.owner.id;

  return (
    <div className="flex size-full items-center justify-center">
      <div className="text-center">
        <div className="mb-2 inline-flex scale-125 items-center justify-center rounded-full border-[5px] border-solid border-primary-50 bg-primary-100 p-1.5 text-primary">
          <i className=" inline-flex min-h-[30px] min-w-[30px] items-center justify-center">
            {plansIconsMap["tier_2"]}
          </i>
        </div>
        <h2 className="mb-2">{t("ui.workspaceDisabled")}</h2>
        <p className="max-w-[550px] text-gray-600">
          {userIsOwner
            ? t("subscription.expiredRenew")
            : t("subscription.expiredContactOwner")}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {userIsOwner && (
            <CustomerPortalForm buttonText={t("ui.manageSubscription")} />
          )}
          <Button
            to={`mailto:${currentOrganization?.owner.email}`}
            variant="secondary"
          >
            {t("ui.contactOwnerX")}
          </Button>
        </div>
      </div>
    </div>
  );
};
