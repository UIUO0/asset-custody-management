/**
 * OTP page copy map.
 *
 * Holds the per-mode title / sub-heading / button copy for the one-time
 * password screen (`/otp`). Titles and button labels are stored as **i18n
 * keys** rather than literals because this map lives at module scope, where
 * the `useTranslation` hook cannot run — callers resolve them with `t()`
 * (client side) or `getFixedT()` (loaders). The sub-headings are real React
 * components, so they call the hook themselves.
 *
 * @see {@link file://./../routes/_auth+/otp.tsx}
 */
import type { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import SubHeading from "~/components/shared/sub-heading";
import { config } from "~/config/shelf.config";

export type OtpVerifyMode = "login" | "signup" | "confirm_signup";

export type OtpPageData = Record<
  OtpVerifyMode,
  {
    /** i18n key for the page title (also used for the browser tab title). */
    titleKey: string;
    SubHeading: FC<{ email: string }>;
    /** i18n key for the primary submit button label. */
    buttonTitleKey: string;
  }
>;

/** Sub-heading shown when the user is logging in with a code. */
const LoginSubHeading: FC<{ email: string }> = ({ email }) => (
  <SubHeading className="-mt-4 text-center">
    <Trans
      i18nKey="otp.loginSubheading"
      values={{ email }}
      components={{ 1: <span className="font-bold text-gray-900" /> }}
    />
  </SubHeading>
);

/** Sub-heading shown while creating a new account. */
const SignupSubHeading: FC<{ email: string }> = () => {
  const { t } = useTranslation();

  return (
    <SubHeading className="-mt-4 text-center">
      {t("otp.signupSubheading", { appName: config.appName })}
    </SubHeading>
  );
};

/** Sub-heading shown while confirming the email address of a new account. */
const ConfirmSignupSubHeading: FC<{ email: string }> = ({ email }) => (
  <SubHeading className="-mt-4 text-center">
    <Trans
      i18nKey="otp.confirmSignupSubheading"
      values={{ email }}
      components={{ 1: <span className="font-bold text-gray-900" /> }}
    />
  </SubHeading>
);

/** Fallback sub-heading used when the `mode` search param is missing/unknown. */
const DefaultSubHeading: FC<{ email: string }> = () => {
  const { t } = useTranslation();

  return (
    <SubHeading className="-mt-4 text-center">
      {t("otp.defaultSubheading")}
    </SubHeading>
  );
};

export const OTP_PAGE_MAP: OtpPageData = {
  login: {
    titleKey: "otp.fillYourCode",
    SubHeading: LoginSubHeading,
    buttonTitleKey: "otp.logInButton",
  },
  signup: {
    titleKey: "otp.createAccountTitle",
    SubHeading: SignupSubHeading,
    buttonTitleKey: "otp.createAccountButton",
  },
  confirm_signup: {
    titleKey: "otp.confirmYourEmail",
    SubHeading: ConfirmSignupSubHeading,
    buttonTitleKey: "otp.confirmButton",
  },
};

export const DEFAULT_PAGE_DATA: OtpPageData["login"] = {
  titleKey: "otp.oneTimePassword",
  buttonTitleKey: "otp.continueButton",
  SubHeading: DefaultSubHeading,
};

/**
 * Resolves the copy bundle for a given OTP verification mode.
 *
 * @param mode - The `mode` search param value; may be missing or unknown
 * @returns The matching copy bundle, or {@link DEFAULT_PAGE_DATA} as a fallback
 */
export function getOtpPageData(mode: OtpVerifyMode) {
  return OTP_PAGE_MAP[mode] ?? DEFAULT_PAGE_DATA;
}
