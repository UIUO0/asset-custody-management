import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { ErrorIcon } from "~/components/errors";
import { Button } from "~/components/shared/button";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";

/**
 * Answer 404, not 200.
 *
 * Without a loader this route rendered the not-found page with the default
 * `200 OK`, so every removed feature — `/kits`, `/tags`, `/bookings`,
 * `/calendar` — and every mistyped URL reported success to anything reading
 * the status rather than the pixels: uptime checks, link crawlers, and the
 * integration clients that call this app's API.
 *
 * The status is *returned*, not thrown: throwing would hand the request to an
 * error boundary, and the point is to keep rendering the friendly page below
 * while telling the truth in the status line.
 */
export function loader() {
  return new Response(null, { status: 404 });
}

export const meta: MetaFunction = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.errors.notFoundShort) }];
};

export default function LayoutSplat() {
  const { t } = useTranslation();

  return (
    <div className="flex size-full h-dvh items-center justify-center">
      <div className="flex flex-col items-center text-center">
        <span className="mb-5 size-14 text-primary">
          <ErrorIcon />
        </span>
        <h2 className="mb-2">{t("errors.notFound")}</h2>
        <p className="max-w-[550px]">
          {t("ui.weCouldnTFindThePageYouWereLookingFor")}
        </p>

        <div className=" mt-8 flex gap-3">
          <Button to="/" variant="secondary" icon="home">
            {t("ui.backToHome")}
          </Button>
        </div>
      </div>
    </div>
  );
}
