import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { data, redirect, useLoaderData } from "react-router";
import type { MetaFunction, LoaderFunctionArgs } from "react-router";
import { dynamicTitleAtom } from "~/atoms/dynamic-title-atom";
import KitsForm, { NewKitFormSchema } from "~/components/kits/form";
import Header from "~/components/layout/header";
import { useSearchParams } from "~/hooks/search-params";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import {
  getCategoriesForCreateAndEdit,
  getLocationsForCreateAndEdit,
} from "~/modules/asset/service.server";
import { createKit, updateKitImage } from "~/modules/kit/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { extractBarcodesFromFormData } from "~/utils/barcode-form-data.server";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import {
  assertIsPost,
  getRefererPath,
  payload,
  error,
  parseData,
} from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

const header = {
  title: "Untitled kit",
};

/** Breadcrumb for the new-kit page (component so it can use the hook). */
function NewKitBreadcrumb() {
  const { t } = useTranslation();
  return <span>{t("kits.untitled")}</span>;
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.kit,
      action: PermissionAction.create,
    });

    const [{ categories, totalCategories }, { locations, totalLocations }] =
      await Promise.all([
        getCategoriesForCreateAndEdit({
          request,
          organizationId,
        }),
        getLocationsForCreateAndEdit({
          request,
          organizationId,
        }),
      ]);

    return payload({
      header,
      categories,
      totalCategories,
      locations,
      totalLocations,
      referer: getRefererPath(request),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [{ title: appendToMetaTitle(resources.kits.untitled) }];
};

export const handle = {
  breadcrumb: () => <NewKitBreadcrumb />,
};

export async function action({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    assertIsPost(request);

    const { organizationId, canUseBarcodes } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.kit,
      action: PermissionAction.create,
    });

    /** Here we need to clone the request as we need 2 different streams:
     * 1. Access form data for creating asset
     * 2. Access form data via upload handler to be able to upload the file
     *
     * This solution is based on : https://github.com/remix-run/remix/issues/3971#issuecomment-1222127635
     */
    const clonedRequest = request.clone();
    const formData = await clonedRequest.formData();

    const payload = parseData(formData, NewKitFormSchema);

    /** Extract barcode data from form */
    const barcodes = canUseBarcodes
      ? extractBarcodesFromFormData(formData)
      : [];

    const kit = await createKit({
      ...payload,
      description: payload.description ?? "",
      createdById: userId,
      organizationId,
      categoryId: payload.category ?? null,
      barcodes,
      locationId: payload.locationId ?? null,
    });

    await updateKitImage({
      request,
      kitId: kit.id,
      userId,
      organizationId,
    });

    sendNotification({
      title: "Kit created",
      message: "Your kit has been created successfully!",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return redirect("/kits");
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function CreateNewKit() {
  const { t } = useTranslation();
  const title = useAtomValue(dynamicTitleAtom);
  const { referer } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const qrId = searchParams.get("qrId");
  return (
    <>
      <Header title={title ?? t("kits.untitled")} />
      <KitsForm qrId={qrId} referer={referer} />
    </>
  );
}
