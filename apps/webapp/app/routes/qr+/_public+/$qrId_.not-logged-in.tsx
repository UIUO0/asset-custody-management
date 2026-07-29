import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { z } from "zod";
import { CuboidIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import { useSearchParams } from "~/hooks/search-params";
import { usePosition } from "~/hooks/use-position";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getQrOrganizationLookup } from "~/modules/qr/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { error, payload, getParams } from "~/utils/http.server";

export const meta = ({ matches }: { matches: any[] }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match: any) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.qr.notLoggedInTitle) }];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const { qrId } = getParams(params, z.object({ qrId: z.string() }));

  try {
    const qr = await getQrOrganizationLookup({ qrId });

    return data(payload({ qrId, canContactOwner: Boolean(qr.organizationId) }));
  } catch (cause) {
    const reason = makeShelfError(cause, { qrId });
    throw data(error(reason), { status: reason.status });
  }
}

export default function QrNotLoggedIn() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { qrId, canContactOwner } = useLoaderData<typeof loader>();
  usePosition();

  return (
    <>
      <div className="flex flex-1 justify-center py-8">
        <div className="my-auto">
          <div className="mb-4 inline-flex items-center justify-center rounded-full border-8 border-solid border-primary-50 bg-primary-100 p-2 text-primary">
            <CuboidIcon />
          </div>
          <div className="mb-8">
            <h1 className="mb-2 text-[24px] font-semibold">
              {t("ui.thankYouForScanning")}
            </h1>
            <p className="text-gray-600">
              {canContactOwner
                ? t("qr.notLoggedInFoundHint")
                : t("qr.notLoggedInUnclaimedHint")}
            </p>
          </div>
          <div className="flex flex-col">
            <Button
              variant="primary"
              className="mb-4 max-w-full"
              to={encodeURI(
                `/login?redirectTo=${searchParams.get("redirectTo")}`,
              )}
            >
              {t("auth.logIn")}
            </Button>
            {canContactOwner ? (
              <Button
                variant="secondary"
                to={`/qr/${qrId}/contact-owner`}
                className="max-w-full"
              >
                {t("ui.contactOwner")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-6 text-center text-sm text-gray-500">
        Don't have an account?{" "}
        <Button
          variant="link"
          data-test-id="signupButton"
          to={encodeURI(`/join?redirectTo=${searchParams.get("redirectTo")}`)}
        >
          {t("ui.signUp")}
        </Button>
      </div>
    </>
  );
}
