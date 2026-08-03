import { useTranslation } from "react-i18next";
import type { useLoaderData } from "react-router";
import DynamicSelect from "~/components/dynamic-select/dynamic-select";
import FormRow from "~/components/forms/form-row";
import type { ModelFilterItem } from "~/hooks/use-model-filters";
import { useValidationMessage } from "~/i18n/validation-messages";
import type { NewBookingLoaderReturnType } from "~/routes/_layout+/bookings.new";
import { resolveTeamMemberName } from "~/utils/user";

// Extract the team member type from the loader return type
export type TeamMemberType = ReturnType<
  typeof useLoaderData<NewBookingLoaderReturnType>
>["teamMembers"][number];

export function CustodianField({
  defaultTeamMember,
  disabled,
  userCanSeeCustodian,
  isNewBooking,
  error: errorProp,
}: {
  defaultTeamMember: TeamMemberType | undefined;
  disabled: boolean;
  userCanSeeCustodian: boolean;
  isNewBooking?: boolean;
  error?: string;
}) {
  /** Validation copy is localised at the display boundary — see
   * `~/i18n/validation-messages`. Unmapped messages pass through unchanged. */
  const resolveValidationMessage = useValidationMessage();
  const error = resolveValidationMessage(errorProp);
  const { t } = useTranslation();
  return (
    <FormRow
      rowLabel={t("bookingForm.custodian")}
      className="mobile-styling-only border-b-0 p-0"
    >
      <label
        className="mb-2.5 block font-medium text-gray-700"
        htmlFor="custodian"
      >
        <span className="required-input-label">
          {t("bookingForm.custodian")}
        </span>
      </label>
      <DynamicSelect
        defaultValue={
          defaultTeamMember
            ? JSON.stringify({
                id: defaultTeamMember?.id,
                name: resolveTeamMemberName(defaultTeamMember),
                userId: defaultTeamMember?.userId,
              })
            : undefined
        }
        disabled={disabled}
        model={{
          name: "teamMember",
          queryKey: "name",
          deletedAt: null,
        }}
        fieldName="custodian"
        contentLabel={t("bookingForm.teamMembers")}
        initialDataKey="teamMembersForForm"
        countKey="totalTeamMembers"
        placeholder={t("bookingForm.selectTeamMember")}
        allowClear
        closeOnSelect
        transformItem={(item: ModelFilterItem & { userId?: string }) => ({
          ...item,
          id: JSON.stringify({
            id: item.id,
            //If there is a user, we use its name, otherwise we use the name of the team member
            name: resolveTeamMemberName(item),
            userId: item?.userId,
          }),
        })}
        renderItem={(item) =>
          userCanSeeCustodian || isNewBooking
            ? resolveTeamMemberName(item, true)
            : t("bookingForm.private")
        }
      />

      {error ? <div className="text-sm text-error-500">{error}</div> : null}
      <p className="mt-2 text-[14px] text-gray-600">
        {t("bookingForm.custodianHint")}
      </p>
    </FormRow>
  );
}
