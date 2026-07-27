import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { useZorm } from "react-zorm";
import z from "zod";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { tw } from "~/utils/tw";
import FormRow from "../forms/form-row";
import { Switch } from "../forms/switch";
import { Card } from "../shared/card";

export const ExplicitCheckinSettingsSchema = z.object({
  requireExplicitCheckinForAdmin: z
    .string()
    .transform((val) => val === "on")
    .default("false"),
  requireExplicitCheckinForSelfService: z
    .string()
    .transform((val) => val === "on")
    .default("false"),
});

export function ExplicitCheckinSettings({
  header,
  defaultValues,
}: {
  header: { title: string; subHeading?: string };
  defaultValues: {
    requireExplicitCheckinForAdmin: boolean;
    requireExplicitCheckinForSelfService: boolean;
  };
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const { isOwner } = useUserRoleHelper();
  const zo = useZorm("ExplicitCheckinForm", ExplicitCheckinSettingsSchema);

  return (
    <Card className={tw("my-0")}>
      <div className="mb-4 border-b pb-4">
        <h3 className="text-text-lg font-semibold">{header.title}</h3>
        <p className="text-sm text-gray-600">{header.subHeading}</p>
      </div>
      <div>
        <fetcher.Form
          ref={zo.ref}
          method="post"
          onChange={(e) => {
            if (isOwner) {
              void fetcher.submit(e.currentTarget);
            }
          }}
        >
          <FormRow
            rowLabel={t("bookingSettings.explicitCheckinAdminLabel")}
            subHeading={
              <div>{t("bookingSettings.explicitCheckinAdminHint")}</div>
            }
            className="border-b-0 pb-[10px] pt-0"
          >
            <div className="flex flex-col items-center gap-2">
              <Switch
                name={zo.fields.requireExplicitCheckinForAdmin()}
                disabled={!isOwner}
                defaultChecked={defaultValues.requireExplicitCheckinForAdmin}
                title={t("bookingSettings.explicitCheckinAdminLabel")}
              />
              <label
                htmlFor={`requireExplicitCheckinForAdmin-${zo.fields.requireExplicitCheckinForAdmin()}`}
                className="hidden text-gray-500"
              >
                {t("bookingSettings.explicitCheckinAdminLabel")}
              </label>
            </div>
          </FormRow>
          <FormRow
            rowLabel={t("bookingSettings.explicitCheckinSelfServiceLabel")}
            subHeading={
              <div>{t("bookingSettings.explicitCheckinSelfServiceHint")}</div>
            }
            className="mt-4 border-b-0 pb-[10px] pt-0"
          >
            <div className="flex flex-col items-center gap-2">
              <Switch
                name={zo.fields.requireExplicitCheckinForSelfService()}
                disabled={!isOwner}
                defaultChecked={
                  defaultValues.requireExplicitCheckinForSelfService
                }
                title={t("bookingSettings.explicitCheckinSelfServiceLabel")}
              />
              <label
                htmlFor={`requireExplicitCheckinForSelfService-${zo.fields.requireExplicitCheckinForSelfService()}`}
                className="hidden text-gray-500"
              >
                {t("bookingSettings.explicitCheckinSelfServiceLabel")}
              </label>
            </div>
          </FormRow>
          {!isOwner && (
            <p className="text-sm text-gray-500">
              {t("bookingSettings.ownerOnlySetting")}
            </p>
          )}
          <input type="hidden" value="updateExplicitCheckin" name="intent" />
        </fetcher.Form>
      </div>
    </Card>
  );
}
