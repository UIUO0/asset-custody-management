import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { data, redirect, redirectDocument } from "react-router";
import { dynamicTitleAtom } from "~/atoms/dynamic-title-atom";
import Header from "~/components/layout/header";
import {
  LocationForm,
  NewLocationFormSchema,
} from "~/components/location/form";

import { db } from "~/database/db.server";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getLocationsForCreateAndEdit } from "~/modules/asset/service.server";
import {
  createLocation,
  updateLocationImage,
} from "~/modules/location/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { payload, error, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
const title = "New Location";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.location,
      action: PermissionAction.create,
    });

    const { locations, totalLocations } = await getLocationsForCreateAndEdit({
      organizationId,
      request,
    });

    const header = {
      title,
    };

    return payload({ header, locations, totalLocations });
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
  return [{ title: appendToMetaTitle(resources.locations.newLocation) }];
};

/** Breadcrumb for the new-location page (component so it can use the hook). */
function NewLocationBreadcrumb() {
  const { t } = useTranslation();
  return <span>{t("locations.newLocation")}</span>;
}

export const handle = {
  breadcrumb: () => <NewLocationBreadcrumb />,
  name: "locations.new",
};

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId: authSession.userId,
      request,
      entity: PermissionEntity.location,
      action: PermissionAction.create,
    });

    /** Here we need to clone the request as we need 2 different streams:
     * 1. Access form data for creating asset
     * 2. Access form data via upload handler to be able to upload the file
     *
     * This solution is based on : https://github.com/remix-run/remix/issues/3971#issuecomment-1222127635
     */
    const clonedRequest = request.clone();

    const parsedData = parseData(
      await clonedRequest.formData(),
      NewLocationFormSchema,
      {
        additionalData: { userId, organizationId },
      },
    );

    const {
      name,
      description,
      address,
      addAnother,
      parentId,
      preventRedirect,
    } = parsedData;

    const location = await createLocation({
      name,
      description,
      address,
      userId: authSession.userId,
      organizationId,
      parentId,
    });

    await updateLocationImage({
      request,
      locationId: location.id,
      organizationId,
    });

    const locationWithImage =
      (await db.location.findUnique({
        where: { id: location.id, organizationId },
        select: {
          id: true,
          name: true,
          thumbnailUrl: true,
          imageUrl: true,
        },
      })) ?? location;

    sendNotification({
      title: "Location created",
      message: "Your location has been created successfully",
      icon: { name: "success", variant: "success" },
      senderId: authSession.userId,
    });

    if (preventRedirect === "true") {
      return data(payload({ success: true, location: locationWithImage }));
    }

    /** If the user clicked add-another, reload the document to clear the form */
    if (addAnother) {
      return redirectDocument("/locations/new");
    }

    return redirect(`/locations/${location.id}`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function NewLocationPage() {
  const { t } = useTranslation();
  const title = useAtomValue(dynamicTitleAtom);

  return (
    <div className="relative">
      <Header title={title ? title : t("locations.untitled")} />
      <div>
        <LocationForm />
      </div>
    </div>
  );
}
