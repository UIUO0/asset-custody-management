import {
  COLLECT_BUSINESS_INTEL,
  DISABLE_SIGNUP,
  DISABLE_SSO,
  ENABLE_PREMIUM_FEATURES,
  FREE_TRIAL_DAYS,
  GEOCODING_USER_AGENT,
  SEND_ONBOARDING_EMAIL,
  SHOW_HOW_DID_YOU_FIND_US,
} from "~/utils/env";
import { Config } from "./types";

export const config: Config = {
  sendOnboardingEmail: SEND_ONBOARDING_EMAIL || false,
  enablePremiumFeatures: ENABLE_PREMIUM_FEATURES || false,
  freeTrialDays: Number(FREE_TRIAL_DAYS || 7),
  disableSignup: DISABLE_SIGNUP || false,
  disableSSO: DISABLE_SSO || false,

  // EPDA (هيئة تطوير المنطقة الشرقية) branding
  logoPath: {
    fullLogo: "/static/images/sda-logo-full.png",
    symbol: "/static/images/sda-symbol.png",
  },
  faviconPath: "/static/favicon.ico",
  emailPrimaryColor: "#044E8B",
  appName: "SDA Assets",
  appIdentifier: "SDA",
  showHowDidYouFindUs: SHOW_HOW_DID_YOU_FIND_US || false,
  collectBusinessIntel:
    COLLECT_BUSINESS_INTEL || SHOW_HOW_DID_YOU_FIND_US || false,
  geocoding: {
    userAgent: GEOCODING_USER_AGENT || "Self-hosted Asset Management System",
  },
};
