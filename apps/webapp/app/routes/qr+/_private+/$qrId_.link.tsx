import { useTranslation } from "react-i18next";
import type {
  MetaFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "react-router";
import {
  data,
  redirect,
  Outlet,
  useLoaderData,
  useMatches,
} from "react-router";
import { z } from "zod";
import { UnlinkIcon } from "~/components/icons/library";
import HorizontalTabs from "~/components/layout/horizontal-tabs";

import { Button } from "~/components/shared/button";

import { db } from "~/database/db.server";
import { useSearchParams } from "~/hooks/search-params";
import { getFixedT, getLocale } from "~/i18n/i18n.server";
import { setSelectedOrganizationIdCookie } from "~/modules/organization/context.server";
import { claimQrCode } from "~/modules/qr/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { setCookie } from "~/utils/cookies.server";
import { makeShelfError, notAllowedMethod, ShelfError } from "~/utils/error";
import {
  payload,
  error,
  getActionMethod,
  getParams,
  parseData,
} from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { qrId } = getParams(params, z.object({ qrId: z.string() }));
  try {
    // why: loaders run outside React, so `useTranslation` is unavailable —
    // `getFixedT` gives the same `t` bound to the request's locale.
    const t = await getFixedT(getLocale(request));

    const { organizationId, organizations, currentOrganization } =
      await requirePermission({
        userId,
        request,
        entity: PermissionEntity.qr,
        action: PermissionAction.update,
      });

    const qr = await db.qr.findUnique({
      // eslint-disable-next-line local-rules/require-org-scope-on-id-queries -- idor-safe: query is intentionally unscoped so the loader can distinguish three cases — unclaimed code (line 62: redirect to /claim), code owned by another org (line 66: throw 403), and code owned by the caller's org (proceed). Org ownership IS enforced at lines 62-74; scoping would collapse the unclaimed case and break the redirect-to-claim flow
      where: {
        id: qrId,
      },
    });

    /**
     * If for some reason this code doesnt have an org(shouldnt happen in this view)
     * we redirect to the claim page
     */
    if (!qr?.organizationId) {
      return redirect(`/qr/${qrId}/claim`);
    }

    if (qr?.organizationId && qr.organizationId !== organizationId) {
      throw new ShelfError({
        message: "This QR code doesn't belong to your current organization.",
        title: "Not allowed",
        label: "QR",
        status: 403,
        cause: null,
      });
    }

    return payload({
      header: {
        title: t("qr.linkWithAssetTitle"),
      },
      qrId,
      organizations,
      currentOrganizationId: currentOrganization.id,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request, params }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { qrId } = getParams(params, z.object({ qrId: z.string() }));

  try {
    const method = getActionMethod(request);

    switch (method) {
      case "POST": {
        const { organizationId, linkTo } = parseData(
          await request.formData(),
          z.object({
            organizationId: z.string(),
            linkTo: z.enum(["new", "existing"]),
          }),
        );
        await claimQrCode({
          id: qrId,
          organizationId,
          userId,
        });

        /**
         * Redirect to the relevant action. We also set the current org to the
         * one selected, as the user could select a different one.
         *
         * EPDA: `linkTo === "new"` no longer creates an asset. Stock enters
         * only through مذكرة/محضر استلام, so a scanned sticker can only be
         * attached to an item that already exists — which is the right order
         * anyway: the delivery is booked in on a form, then someone walks
         * around labelling what arrived. The value is still accepted so an
         * older client sending it lands somewhere sensible instead of erroring.
         */
        return redirect(
          linkTo === "new"
            ? `/receipts/new?qrId=${qrId}`
            : `/qr/${qrId}/link-existing-asset`,
          {
            headers: [
              setCookie(await setSelectedOrganizationIdCookie(organizationId)),
            ],
          },
        );
      }
    }

    throw notAllowedMethod(method);
  } catch (cause) {
    const reason = makeShelfError(cause);
    return data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: appendToMetaTitle(data?.header.title) },
];

export default function QrLink() {
  const { t } = useTranslation();
  const { qrId } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const comesFromClaim = searchParams.get("ref") === "claim";
  const matches = useMatches();
  const currentRoute = matches[matches.length - 1];

  const isLinkPage = currentRoute?.id === "routes/qr+/_private+/$qrId_.link";

  return (
    <>
      {isLinkPage ? (
        <div className="flex flex-1 justify-center py-8">
          <div className="my-auto">
            <div className="mb-4 inline-flex items-center justify-center rounded-full border-8 border-solid border-primary-50 bg-primary-100 p-2 text-primary">
              <UnlinkIcon />
            </div>
            <div className="mb-8">
              <h1 className="mb-2 text-[24px] font-semibold">
                {t("ui.unlinkedQrCode")}
              </h1>
              <p className="text-gray-600">
                {comesFromClaim
                  ? t("qr.claimedLinkHint")
                  : t("qr.unlinkedCodeHint")}
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2">
              {/*
               * EPDA: "create a new asset here" is gone. It was a second door
               * into inventory, bypassing the receipt forms that carry the
               * supplier, the purchase order and the price. Linking a sticker
               * to an item that already exists is now the primary action —
               * the delivery is booked in on a form first, then labelled.
               */}
              <Button
                variant="primary"
                className=" max-w-full"
                to={`/qr/${qrId}/link/asset`}
              >
                {t("qr.linkToExisting")}
              </Button>
              <Button
                variant="secondary"
                className=" max-w-full"
                to={`/kits/new?qrId=${qrId}`}
              >
                {t("ui.createANewKitAndLink")}
              </Button>

              <Button variant="secondary" className="max-w-full" to={"/"}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <HorizontalTabs
            items={[
              {
                to: "asset",
                content: t("nav.assets"),
              },
              {
                to: "kit",
                content: t("nav.kits"),
              },
            ]}
            className="mb-0 justify-center ps-0 [&>a]:w-full"
          />
          <div className="max-h-full">
            <Outlet />
          </div>
        </div>
      )}
    </>
  );
}
