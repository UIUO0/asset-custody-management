import { useTranslation } from "react-i18next";
import { useDisabled } from "~/hooks/use-disabled";
import { Form } from "../custom-form";
import { Button } from "../shared/button";

export default function PasswordResetForm() {
  const { t } = useTranslation();
  const isProcessing = useDisabled();

  return (
    <div>
      <div>
        <Form method="post">
          <input type="hidden" name="type" value="resetPassword" />
          <input type="hidden" name="intent" value="resetPassword" />
          <Button data-test-id="logout" type="submit" variant="link">
            {isProcessing ? t("auth.loggingYouOut") : t("auth.resetPassword")}
          </Button>
        </Form>
      </div>
    </div>
  );
}
