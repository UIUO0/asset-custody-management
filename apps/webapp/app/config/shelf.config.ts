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
    fullLogo: "/static/images/epda-logo-full.png",
    symbol: "/static/images/epda-symbol.png",
  },
  faviconPath: "/static/favicon.ico",
  emailPrimaryColor: "#044E8B",
  appName: "EPDA Assets",
  appIdentifier: "EPDA",
  showHowDidYouFindUs: SHOW_HOW_DID_YOU_FIND_US || false,
  collectBusinessIntel:
    COLLECT_BUSINESS_INTEL || SHOW_HOW_DID_YOU_FIND_US || false,
  // Debounce window for recording mobile companion-app activity (1 hour).
  mobileActivityDebounceMs: 60 * 60 * 1000,
  // Companion Android package; declared as the App Links target by the
  // assetlinks.json route. Must match apps/companion/app.json android.package.
  companionAndroidPackageName: "com.shelf.companion",
  geocoding: {
    userAgent: GEOCODING_USER_AGENT || "Self-hosted Asset Management System",
  },
};
