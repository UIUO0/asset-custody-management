/**
 * Validation-message localisation.
 *
 * Zod schemas in this app live at module scope, where the `useTranslation` hook
 * cannot run, and the same schemas are re-used server-side by `parseData` and by
 * the mobile API. Rewriting their messages into i18n keys would therefore leak
 * raw keys into server logs and into the companion app.
 *
 * Instead the schemas keep their English messages verbatim — the single source
 * of truth — and translation happens at the **display boundary**: every
 * component that renders a field error passes the message through
 * {@link useValidationMessage} first. Unmapped messages (third-party or Zod
 * built-ins) fall through unchanged, so nothing can ever render blank.
 *
 * ## Adding a message
 * 1. Add the exact English string to {@link VALIDATION_MESSAGE_KEYS} below.
 * 2. Add the matching key to **both** `locales/en.json` and `locales/ar.json`
 *    under the `validation` namespace.
 *
 * @see {@link file://./locales/ar.json}
 * @see {@link file://./../components/forms/input.tsx} — the main display boundary
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";

/**
 * Exact English validation message → i18n key.
 *
 * Keyed by the literal string the Zod schema produces, so the schemas
 * themselves never need to change.
 */
export const VALIDATION_MESSAGE_KEYS: Record<string, string> = {
  "Amount must be positive": "validation.amountPositive",
  "Asset ID is required": "validation.assetIdRequired",
  "Asset model ID is required": "validation.assetModelIdRequired",
  "At least one asset is required.": "validation.atLeastOneAsset",
  "At least one asset must be selected": "validation.atLeastOneAssetSelected",
  "At least one asset or kit must be selected":
    "validation.atLeastOneAssetOrKit",
  "At least one day must be marked as open": "validation.atLeastOneOpenDay",
  "At least one filter is required": "validation.atLeastOneFilter",
  "At least one tag is required": "validation.atLeastOneTag",
  "At least one tag must be selected": "validation.atLeastOneTagSelected",
  "Audit ID is required": "validation.auditIdRequired",
  "Audit name is required": "validation.auditNameRequired",
  "Authorization code is required": "validation.authCodeRequired",
  "Barcode value is required": "validation.barcodeValueRequired",
  "Buffer cannot exceed 168 hours (7 days)": "validation.bufferMax",
  "Buffer must be at least 0 hours": "validation.bufferMin",
  "Cancellation reason must be 500 characters or less":
    "validation.cancelReasonMax",
  "Cannot exceed 365 days": "validation.max365Days",
  "Close time is required when day is marked as open":
    "validation.closeTimeRequiredDay",
  "Close time is required when override is open":
    "validation.closeTimeRequiredOverride",
  "Close time must be after open time": "validation.closeAfterOpen",
  "Code must be 6 digits": "validation.codeSixDigits",
  "Company or organization is required": "validation.companyRequired",
  "Confirmation is required": "validation.confirmationRequired",
  "Content is required": "validation.contentRequired",
  "Count must be a number": "validation.countNumber",
  "Count must be at least 2": "validation.countMin2",
  "Count must be at most 100": "validation.countMax100",
  "Date is required": "validation.dateRequired",
  "Date must be in YYYY-MM-DD format": "validation.dateFormatIso",
  "Description must be 1000 characters or fewer":
    "validation.descriptionMax1000",
  "Due date must be in the future": "validation.dueDateFuture",
  "Emails do not match": "validation.emailsMismatch",
  "End date cannot be earlier than start date": "validation.endBeforeStart",
  "End date is required": "validation.endDateRequired",
  "Field is required.": "validation.fieldRequired",
  "First name is required": "validation.firstNameRequired",
  "Invalid checkin disposition payload": "validation.invalidCheckinPayload",
  "Invalid checkout disposition payload": "validation.invalidCheckoutPayload",
  "Invalid close time format": "validation.invalidCloseTime",
  "Invalid date": "validation.invalidDate",
  "Invalid date format": "validation.invalidDateFormat",
  "Invalid open time format": "validation.invalidOpenTime",
  "Last name is required": "validation.lastNameRequired",
  "Maximum 150 locations at a time": "validation.max150Locations",
  "Maximum booking length cannot exceed 8760 hours (1 year)":
    "validation.maxBookingLengthMax",
  "Maximum booking length must be at least 1 hour":
    "validation.maxBookingLengthMin",
  "Message is too long": "validation.messageTooLong",
  "Min quantity must be a number": "validation.minQuantityNumber",
  "Must be at least 1 day": "validation.min1Day",
  "Name is required": "validation.nameRequired",
  "Name template is required": "validation.nameTemplateRequired",
  "Name too long": "validation.nameTooLong",
  "New email must be different from your current email":
    "validation.newEmailMustDiffer",
  "New owner is required": "validation.newOwnerRequired",
  "Note content is required": "validation.noteContentRequired",
  "OTP is required.": "validation.otpRequired",
  "Open time is required when day is marked as open":
    "validation.openTimeRequiredDay",
  "Open time is required when override is open":
    "validation.openTimeRequiredOverride",
  "Password and confirm password must match": "validation.passwordsMismatch",
  "Password is too short. Minimum 8 characters.": "validation.passwordTooShort",
  "Please enter a valid domain name": "validation.validDomain",
  "Please enter a valid email": "validation.validEmail",
  "Please enter message.": "validation.enterMessage",
  "Please enter name.": "validation.enterName",
  "Please enter the code sent to your email": "validation.enterEmailedCode",
  "Please provide at least 10 characters": "validation.min10Characters",
  "Please select a booking": "validation.selectBooking",
  "Please select a booking.": "validation.selectBookingDot",
  "Please select a category": "validation.selectCategory",
  "Please select a custodian": "validation.selectCustodian",
  "Please select a location": "validation.selectLocation",
  "Please select a role": "validation.selectRole",
  "Please select a value": "validation.selectValue",
  "Please select an asset model": "validation.selectAssetModel",
  "Please select an audit": "validation.selectAudit",
  "Please select at least one asset or kit.":
    "validation.selectAtLeastOneAssetOrKit",
  "Please select at least one asset to check in.":
    "validation.selectAtLeastOneAssetCheckin",
  "Please select at least one asset to check out.":
    "validation.selectAtLeastOneAssetCheckout",
  "Please select at least one asset.": "validation.selectAtLeastOneAsset",
  "Please select at least one kit.": "validation.selectAtLeastOneKit",
  "Please select at least one team member": "validation.selectAtLeastOneMember",
  "Please select at least one value": "validation.selectAtLeastOneValue",
  "Please select booking.": "validation.selectBookingShort",
  "Preset ID is required": "validation.presetIdRequired",
  "Quantity must be a number": "validation.quantityNumber",
  "Range must have two values": "validation.rangeTwoValues",
  "Reason is a required field": "validation.reasonRequired",
  "Reason must be less than 500 characters": "validation.reasonMax500",
  "Scan at least one asset or kit to add.": "validation.scanAtLeastOneToAdd",
  "Select at least one asset or kit to remove.":
    "validation.selectAtLeastOneToRemove",
  "Start date is required": "validation.startDateRequired",
  "Team member is required": "validation.teamMemberRequired",
  "Team size is required": "validation.teamSizeRequired",
  "Time must be in HH:MM format (24-hour)": "validation.timeFormat24h",
  "Time zone is required": "validation.timeZoneRequired",
  "Title is required": "validation.titleRequired",
  "Title must be at least 2 characters": "validation.titleMin2",
  "Value is required": "validation.valueRequired",
  "You must agree to changing the owner of the workspace":
    "validation.mustAgreeOwnerChange",
  "Your password is too short. Min 8 characters are required.":
    "validation.passwordTooShortAlt",
  "checkins is not valid JSON": "validation.checkinsInvalidJson",
  "checkouts is not valid JSON": "validation.checkoutsInvalidJson",
};

/**
 * Returns a resolver that localises a validation message.
 *
 * @returns A function taking the raw message and returning the localised text,
 *   or the original message when it is not a known validation string. Passing
 *   `undefined`/`null` returns `undefined`, so it is safe to call on optional
 *   error props.
 *
 * @example
 * const resolveError = useValidationMessage();
 * <Input error={resolveError(zo.errors.name()?.message)} />
 */
export function useValidationMessage() {
  const { t } = useTranslation();

  return useCallback(
    (message?: string | null): string | undefined => {
      if (!message) return undefined;
      const key = VALIDATION_MESSAGE_KEYS[message];
      return key ? t(key) : message;
    },
    [t],
  );
}
