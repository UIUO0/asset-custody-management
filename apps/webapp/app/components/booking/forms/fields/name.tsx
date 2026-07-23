import type { ChangeEventHandler } from "react";
import { useTranslation } from "react-i18next";
import FormRow from "~/components/forms/form-row";
import Input from "~/components/forms/input";
import { useAutoFocus } from "~/hooks/use-auto-focus";

export function NameField({
  name,
  fieldName,
  disabled,
  error,
  onChange,
}: {
  name: string | undefined;
  fieldName?: string;
  disabled?: boolean;
  error?: string;
  onChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
}) {
  // NameField is the first field in every booking form (new + edit + the
  // create-booking-from-selection dialog), so focus on mount mirrors the
  // removed autoFocus behaviour.
  const inputRef = useAutoFocus<HTMLInputElement>();
  const { t } = useTranslation();
  return (
    <FormRow
      rowLabel={t("bookingForm.name")}
      className="mobile-styling-only border-b-0 p-0"
      required
    >
      <Input
        ref={inputRef}
        label={t("bookingForm.name")}
        hideLabel
        name={fieldName}
        disabled={disabled}
        error={error}
        onChange={onChange}
        className="mobile-styling-only w-full p-0"
        defaultValue={name}
        placeholder={t("bookingForm.namePlaceholder")}
        required
      />
    </FormRow>
  );
}
