import "@testing-library/jest-dom/vitest";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { i18nConfig } from "~/i18n/config";
import { server } from "./mocks";

/**
 * Initialize i18next once for the whole test run.
 *
 * Components call `useTranslation()`, and without an initialised instance
 * react-i18next logs a warning and `t("some.key")` returns the **key** rather
 * than the translated string — so every assertion that looks for user-visible
 * English text fails with a confusing "unable to find element" error.
 *
 * Pinned to `en` (not the app default `ar`) because the existing component
 * tests assert on English copy. Tests that need Arabic can call
 * `i18next.changeLanguage("ar")` themselves.
 *
 * @see {@link file://./../app/i18n/config.ts} — the shared options reused here
 */
void i18next.use(initReactI18next).init({
  ...i18nConfig,
  lng: "en",
  // Keys are asserted on directly in some suites; returning the key rather
  // than an empty string keeps those failures readable.
  parseMissingKeyHandler: (key) => key,
});

declare global {
  // Let React know this environment supports act() (Vitest + happy-dom)
  // so it does not warn during tests.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  get: () => true,
  set: () => {
    // Keep the flag stable for React act() detection.
  },
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    get: () => true,
    set: () => {
      // Keep the flag stable for React act() detection.
    },
  });
}

process.env.DATABASE_URL =
  "postgres://{USER}:{PASSWORD}@{HOST}:6543/{DB_NAME}?pgbouncer=true";
process.env.DIRECT_URL = "postgres://{USER}:{PASSWORD}@{HOST}:5432/{DB_NAME}";
process.env.SESSION_SECRET = "super-duper-s3cret";
process.env.SUPABASE_ANON_PUBLIC = "{ANON_PUBLIC}";
process.env.SUPABASE_SERVICE_ROLE = "{SERVICE_ROLE}";
process.env.SUPABASE_URL = "https://supabase-project.supabase.co";
process.env.SERVER_URL = "http://localhost:3000";
process.env.APP_NAME = "Shelf";
process.env.ENABLE_PREMIUM_FEATURES = "true";
process.env.STRIPE_SECRET_KEY = "stripe-secret-key";
process.env.STRIPE_PUBLIC_KEY = "stripe-public-key";
process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET = "stripe-endpoint-secret";
process.env.SMTP_PWD = "super-safe-passw0rd";
process.env.SMTP_HOST = "mail.example.com";
process.env.SMTP_PORT = "465";
process.env.SMTP_USER = "some-email@example.com";
process.env.MAPTILER_TOKEN = "maptiler-token";
process.env.GEOCODING_USER_AGENT = "Test Asset Management";
process.env.MICROSOFT_CLARITY_ID = "microsoft-clarity-id";
process.env.INVITE_TOKEN_SECRET = "secret-test-invite";
process.env.SENTRY_ORG = "sentry-org";
process.env.SENTRY_PROJECT = "sentry-project";
process.env.SENTRY_DSN = "sentry-dsn";

if (typeof window !== "undefined") {
  // @ts-expect-error missing vitest type
  window.happyDOM.settings.enableFileSystemHttpRequests = true;

  // Make requestAnimationFrame run synchronously to prevent act() warnings
  // from Radix UI components that use RAF for animations
  let rafId = 0;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = ++rafId;
    queueMicrotask(() => cb(performance.now()));
    return id;
  };
  window.cancelAnimationFrame = (_frameId: number) => {
    // no-op
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
