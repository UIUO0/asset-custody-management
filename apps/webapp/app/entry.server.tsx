/* eslint-disable no-console */
import { PassThrough } from "stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import * as Sentry from "@sentry/react-router";
import type { i18n as I18nInstance } from "i18next";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { ServerRouter } from "react-router";
import type { AppLoadContext, EntryContext } from "react-router";
import { registerEmailWorkers } from "./emails/email.worker.server";
import { createI18nInstance, getLocale } from "./i18n/i18n.server";
import { registerAddonTrialWorkers } from "./modules/addon-trial/worker.server";
import { regierAssetWorkers } from "./modules/asset-reminder/worker.server";
import { registerAuditWorkers } from "./modules/audit/worker.server";
import { registerBookingWorkers } from "./modules/booking/worker.server";
import { ShelfError } from "./utils/error";
import { Logger } from "./utils/logger";
import * as schedulerService from "./utils/scheduler.server";
export * from "../server";

// === start: register scheduler and workers ===
schedulerService
  .init()
  .then(() =>
    Promise.all([
      registerBookingWorkers()
        .then(() => console.log("Booking workers registered"))
        .catch((cause) => {
          Logger.error(
            new ShelfError({
              cause,
              message:
                "Something went wrong while registering booking workers.",
              label: "Scheduler",
            })
          );
        }),
      regierAssetWorkers()
        .then(() => console.log("Asset workers registered"))
        .catch((cause) => {
          Logger.error(
            new ShelfError({
              cause,
              message: "Something went wrong while registering asset workers.",
              label: "Scheduler",
            })
          );
        }),
      registerEmailWorkers()
        .then(() => console.log("Email workers registered"))
        .catch((cause) => {
          Logger.error(
            new ShelfError({
              cause,
              message: "Something went wrong while registering email workers.",
              label: "Scheduler",
            })
          );
        }),
      registerAuditWorkers()
        .then(() => console.log("Audit workers registered"))
        .catch((cause) => {
          Logger.error(
            new ShelfError({
              cause,
              message: "Something went wrong while registering audit workers.",
              label: "Scheduler",
            })
          );
        }),
      registerAddonTrialWorkers()
        .then(() => console.log("Addon trial workers registered"))
        .catch((cause) => {
          Logger.error(
            new ShelfError({
              cause,
              message:
                "Something went wrong while registering addon trial workers.",
              label: "Scheduler",
            })
          );
        }),
    ])
  )
  .finally(() => {
    // eslint-disable-next-line no-console
    console.log("Scheduler and workers registration completed");
  })
  .catch((cause) => {
    Logger.error(
      new ShelfError({
        cause,
        message: "Scheduler crash",
        label: "Scheduler",
      })
    );
  });
// === end: register scheduler and workers ===

/**
 * Handle errors that are not handled by a loader or action try/catch block.
 *
 * If this happen, you will have Sentry logs with a `Unhandled` tag and `unhandled.remix.server` as origin.
 *
 */
export const handleError = Sentry.createSentryHandleError({
  logErrors: false,
});

const ABORT_DELAY = 5000;

// Stream timeout for v3_singleFetch
export const streamTimeout = 5000;

/**
 * Resolves the request locale and renders through an `I18nextProvider` so SSR
 * output is already translated. Without this the server would render the
 * fallback language and the client would swap it on hydration — a visible
 * flash of untranslated content on every page load.
 */
async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  // This is ignored so we can keep it in the template for visibility.  Feel
  // free to delete this parameter in your app if you're not using it!
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loadContext: AppLoadContext
) {
  const i18n = await createI18nInstance(getLocale(request));

  return isbot(request.headers.get("user-agent") || "")
    ? handleBotRequest(
        request,
        responseStatusCode,
        responseHeaders,
        reactRouterContext,
        i18n
      )
    : handleBrowserRequest(
        request,
        responseStatusCode,
        responseHeaders,
        reactRouterContext,
        i18n
      );
}

function handleBotRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  i18n: I18nInstance
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      <I18nextProvider i18n={i18n}>
        <ServerRouter context={reactRouterContext} url={request.url} />
      </I18nextProvider>,
      {
        onAllReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

function handleBrowserRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  i18n: I18nInstance
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      <I18nextProvider i18n={i18n}>
        <ServerRouter context={reactRouterContext} url={request.url} />
      </I18nextProvider>,
      {
        onShellReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

// Wrap with Sentry so server errors/transactions are reported.
export default Sentry.wrapSentryHandleRequest(handleRequest);
