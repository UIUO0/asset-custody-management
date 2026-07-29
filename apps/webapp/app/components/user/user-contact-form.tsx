import { useTranslation } from "react-i18next";
import { useActionData } from "react-router";
import { useZorm } from "react-zorm";
import z from "zod";
import { useDisabled } from "~/hooks/use-disabled";
import type { getUserWithContact } from "~/modules/user/service.server";
import type { UserPageActionData } from "~/routes/_layout+/account-details.general";
import { getValidationErrors } from "~/utils/http";
import { zodFieldIsRequired } from "~/utils/zod";
import { Form } from "../custom-form";
import FormRow from "../forms/form-row";
import Input from "../forms/input";
import { Button } from "../shared/button";
import { Card } from "../shared/card";

export const UserContactDetailsFormSchema = z.object({
  phone: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  zipPostalCode: z.string().optional(),
  countryRegion: z.string().optional(),
});
export function UserContactDetailsForm({
  user,
}: {
  user: ReturnType<typeof getUserWithContact>;
}) {
  const { t } = useTranslation();
  const zo = useZorm("UserContactDetailsForm", UserContactDetailsFormSchema);
  const actionData = useActionData<UserPageActionData>();
  const disabled = useDisabled();
  const isDisabled =
    disabled ||
    (user.sso && {
      reason: t("userForm.ssoCannotEdit"),
    });
  const validationErrors = getValidationErrors<
    typeof UserContactDetailsFormSchema
  >(actionData?.error);

  return (
    <Card className="my-0">
      <div className="mb-6">
        <h3 className="text-text-lg font-semibold">
          {t("userForm.contactInformation")}
        </h3>
        <p className="text-sm text-gray-600">{t("userForm.contactHint")}</p>
      </div>
      <Form method="post" ref={zo.ref} className="" replace>
        <FormRow
          rowLabel={t("ui.phoneNumber")}
          className="border-t"
          required={zodFieldIsRequired(
            UserContactDetailsFormSchema.shape.phone,
          )}
        >
          <Input
            label={t("ui.phone")}
            type="tel"
            autoComplete="tel"
            hideLabel
            name={zo.fields.phone()}
            defaultValue={user?.contact?.phone || undefined}
            error={
              validationErrors?.phone?.message || zo.errors.phone()?.message
            }
            placeholder="+1 (555) 123-4567"
            required={zodFieldIsRequired(
              UserContactDetailsFormSchema.shape.phone,
            )}
            disabled={isDisabled}
          />
        </FormRow>

        <FormRow
          rowLabel={t("userForm.streetAddress")}
          required={zodFieldIsRequired(
            UserContactDetailsFormSchema.shape.street,
          )}
        >
          <Input
            label={t("ui.street")}
            type="text"
            autoComplete="street-address"
            name={zo.fields.street()}
            defaultValue={user?.contact?.street || undefined}
            error={
              validationErrors?.street?.message || zo.errors.street()?.message
            }
            hideLabel
            placeholder={t("userForm.streetAddressPlaceholder")}
            required={zodFieldIsRequired(
              UserContactDetailsFormSchema.shape.street,
            )}
            disabled={isDisabled}
          />
        </FormRow>

        <FormRow
          rowLabel={t("userForm.city")}
          required={zodFieldIsRequired(UserContactDetailsFormSchema.shape.city)}
        >
          <Input
            label={t("userForm.city")}
            type="text"
            hideLabel
            autoComplete="city"
            name={zo.fields.city()}
            defaultValue={user?.contact?.city || undefined}
            error={validationErrors?.city?.message || zo.errors.city()?.message}
            placeholder={t("userForm.cityPlaceholder")}
            required={zodFieldIsRequired(
              UserContactDetailsFormSchema.shape.city,
            )}
            disabled={isDisabled}
          />
        </FormRow>

        <FormRow
          rowLabel={t("userForm.stateAndPostal")}
          required={zodFieldIsRequired(
            UserContactDetailsFormSchema.shape.stateProvince,
          )}
        >
          <div className="flex gap-6">
            <Input
              label={t("userForm.stateProvince")}
              hideLabel
              autoComplete="state"
              type="text"
              name={zo.fields.stateProvince()}
              defaultValue={user?.contact?.stateProvince || undefined}
              error={
                validationErrors?.stateProvince?.message ||
                zo.errors.stateProvince()?.message
              }
              placeholder={t("ui.california")}
              required={zodFieldIsRequired(
                UserContactDetailsFormSchema.shape.stateProvince,
              )}
              disabled={isDisabled}
            />
            <Input
              label={t("userForm.postalCode")}
              type="text"
              hideLabel
              autoComplete="postal-code"
              name={zo.fields.zipPostalCode()}
              defaultValue={user?.contact?.zipPostalCode || undefined}
              error={
                validationErrors?.zipPostalCode?.message ||
                zo.errors.zipPostalCode()?.message
              }
              placeholder="94102"
              required={zodFieldIsRequired(
                UserContactDetailsFormSchema.shape.zipPostalCode,
              )}
              disabled={isDisabled}
            />
          </div>
        </FormRow>

        <FormRow
          rowLabel={t("userForm.countryRegion")}
          className="border-b-0 pb-0"
          required={zodFieldIsRequired(
            UserContactDetailsFormSchema.shape.countryRegion,
          )}
        >
          <Input
            label={t("userForm.countryRegion")}
            type="text"
            hideLabel
            autoComplete="country"
            name={zo.fields.countryRegion()}
            defaultValue={user?.contact?.countryRegion || undefined}
            error={
              validationErrors?.countryRegion?.message ||
              zo.errors.countryRegion()?.message
            }
            placeholder={t("userForm.countryPlaceholder")}
            required={zodFieldIsRequired(
              UserContactDetailsFormSchema.shape.countryRegion,
            )}
            disabled={isDisabled}
          />
        </FormRow>

        <div className="text-end">
          <input type="hidden" name="type" value="updateUserContact" />
          <Button
            disabled={isDisabled}
            type="submit"
            name="intent"
            value="updateUserContact"
          >
            Save
          </Button>
        </div>
      </Form>
    </Card>
  );
}
