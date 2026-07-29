import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { isFormProcessing } from "~/utils/form";
import { Button } from "../shared/button";

export const CustomerPortalForm = ({
  buttonText: buttonTextProp,
  buttonProps,
  className,
}: {
  buttonText?: string;
  buttonProps?: ComponentProps<typeof Button>;
  className?: string;
}) => {
  const { t } = useTranslation();
  /** Falls back to the translated default when the caller omits `buttonText`. */
  const buttonText = buttonTextProp ?? t("ui.goToCustomerPortal");
  const customerPortalFetcher = useFetcher();
  const isProcessing = isFormProcessing(customerPortalFetcher.state);
  return (
    <customerPortalFetcher.Form
      method="post"
      action="/account-details/subscription/customer-portal"
      className={className}
    >
      <Button type="submit" disabled={isProcessing} {...buttonProps}>
        {isProcessing ? t("subscription.redirectingToPortal") : buttonText}
      </Button>
    </customerPortalFetcher.Form>
  );
};
