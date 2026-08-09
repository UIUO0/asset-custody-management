import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import type { User } from "@prisma/client";
import nProgressStyles from "nprogress/nprogress.css?url";
import { useTranslation } from "react-i18next";
import type {
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteLoaderData,
} from "react-router";
import { ErrorContent } from "./components/errors";
import BlockInteractions from "./components/layout/maintenance-mode";
import { SidebarTrigger } from "./components/layout/sidebar/sidebar";
import { Clarity } from "./components/marketing/clarity";
import { CloudflareWebAnalytics } from "./components/marketing/cloudflare-web-analytics";
import { AnimationProvider } from "./components/shared/animation-provider";
import { TooltipProvider } from "./components/shared/tooltip";
import { config } from "./config/shelf.config";
import { useNprogress } from "./hooks/use-nprogress";
import { DEFAULT_LOCALE, getDirection } from "./i18n/config";
import { getLocale } from "./i18n/i18n.server";
import fontsStylesheetUrl from "./styles/fonts.css?url";
import globalStylesheetUrl from "./styles/global.css?url";
import nProgressCustomStyles from "./styles/nprogress.css?url";
import pmDocStylesheetUrl from "./styles/pm-doc.css?url";
import styles from "./tailwind.css?url";
import { ClientHintCheck, getClientHint } from "./utils/client-hints";
import { getBrowserEnv, MAINTENANCE_MODE } from "./utils/env";
import { payload } from "./utils/http.server";
import { useNonce } from "./utils/nonce-provider";
import { isAdmin } from "./utils/roles.server";
import { splashScreenLinks } from "./utils/splash-screen-links";

export interface RootData {
  env: typeof getBrowserEnv;
  user: User;
}

export const handle = {
  breadcrumb: () => <SidebarTrigger />,
};

export const links: LinksFunction = () => [
  { rel: "manifest", href: "/static/manifest.json" },
  { rel: "apple-touch-icon", href: config.faviconPath },
  { rel: "icon", href: config.faviconPath },
  ...splashScreenLinks,
  { rel: "stylesheet", href: styles },
  { rel: "stylesheet", href: fontsStylesheetUrl },
  { rel: "stylesheet", href: globalStylesheetUrl },
  { rel: "stylesheet", href: pmDocStylesheetUrl },
  { rel: "stylesheet", href: nProgressStyles },
  { rel: "stylesheet", href: nProgressCustomStyles },
];

export const meta: MetaFunction = () => [
  {
    title: "هيئة تطوير المنطقة الشرقية",
  },
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  // Super admins bypass maintenance — best-effort. If the admin lookup
  // throws (no session, missing context.getSession, DB error during a
  // migration, etc.), fall through with admin=null so the loader still
  // returns a valid payload. Worst case: admin sees the maintenance
  // screen too. Best case: admin sees the app while users see maintenance.
  const admin = MAINTENANCE_MODE
    ? await isAdmin(context).catch(() => null)
    : null;

  // Locale is resolved here (not in a child route) because the <html>
  // element lives in this module's Layout — it must be known before any
  // markup is emitted to avoid a direction flash.
  // why: dark mode is intentionally removed EPDA-wide — the system always
  // renders the light theme, so no theme preference is resolved.
  const locale = getLocale(request);

  return payload({
    env: getBrowserEnv(),
    maintenanceMode: MAINTENANCE_MODE && !admin,
    locale,
    dir: getDirection(locale),
    requestInfo: {
      hints: getClientHint(request),
    },
  });
};

export const shouldRevalidate = () => false;

/**
 * Subscribe/snapshot helpers for reading `navigator.cookieEnabled` via
 * `useSyncExternalStore`. `navigator.cookieEnabled` is a static boolean per
 * session — no actual change event exists — so `subscribe` is a no-op. Using
 * `useSyncExternalStore` (instead of `useEffect` + `useState`) lets us read the
 * browser value consistently without a flash-of-wrong-content on hydration.
 */
const subscribeCookieEnabled = () => () => {};
const getCookieEnabledSnapshot = () => navigator.cookieEnabled;
// On the server we optimistically assume cookies are enabled so children render;
// `suppressHydrationWarning` on the <body> absorbs any client-side mismatch.
const getCookieEnabledServerSnapshot = () => true;

export function Layout({ children }: { children: ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const { t } = useTranslation();
  const nonce = useNonce();
  const hasCookies = useSyncExternalStore(
    subscribeCookieEnabled,
    getCookieEnabledSnapshot,
    getCookieEnabledServerSnapshot,
  );

  // Fall back to the defaults when the root loader hasn't run (error boundary
  // renders Layout without loader data).
  const locale = data?.locale ?? DEFAULT_LOCALE;
  const dir = data?.dir ?? getDirection(DEFAULT_LOCALE);

  return (
    <html
      lang={locale}
      dir={dir}
      // why: dark mode is removed EPDA-wide — the `dark` class is never
      // applied and the color scheme is pinned to light so form controls
      // and scrollbars don't follow the OS dark preference.
      className="overflow-hidden"
      style={{ colorScheme: "light" }}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* why: no iOS Smart App Banner. The upstream one advertised the
            public "Shelf Companion" App Store listing — a third-party app,
            not this deployment's build. The in-repo companion app was itself
            removed on 2026-08-06; EPDA runs on the web app only. */}
        <ClientHintCheck nonce={nonce} />
        <style data-fullcalendar />
        <Meta />
        <Links />
        <Clarity />
      </head>
      <body suppressHydrationWarning>
        <noscript>
          <BlockInteractions
            title={t("errors.javascriptDisabled")}
            content={t("errors.javascriptDisabledContent")}
            icon="x"
          />
        </noscript>

        {hasCookies ? (
          // Single app-level TooltipProvider. Radix recommends wrapping the
          // app once and tolerates nested providers (they merge configs), but
          // hoisting avoids spinning up a provider per-row for high-frequency
          // chips like AssetCodeBadge. delayDuration matches the previous
          // per-chip default so tooltip timing doesn't change.
          <TooltipProvider delayDuration={100}>{children}</TooltipProvider>
        ) : (
          <BlockInteractions
            title={t("errors.cookiesDisabled")}
            content={t("errors.cookiesDisabledContent")}
            icon="x"
          />
        )}

        <ScrollRestoration />
        {/* why: SSR env injection must execute in the browser; React's `<script>{text}</script>` does not run. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `window.env = ${JSON.stringify(data?.env)}`,
          }}
        />
        <CloudflareWebAnalytics />
        <Scripts />
      </body>
    </html>
  );
}

function App() {
  useNprogress();
  const { t } = useTranslation();
  const { maintenanceMode } = useLoaderData<typeof loader>();

  return maintenanceMode ? (
    <BlockInteractions
      title={t("errors.maintenanceTitle")}
      content={t("errors.maintenanceContent")}
      icon="tool"
    />
  ) : (
    <AnimationProvider>
      <Outlet />
    </AnimationProvider>
  );
}

export default App;

export const ErrorBoundary = () => <ErrorContent />;
