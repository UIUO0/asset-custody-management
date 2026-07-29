import { MapPinIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { z } from "zod";
import { LocationSelect } from "~/components/location/location-select";
import { Button } from "~/components/shared/button";
import { useDisabled } from "~/hooks/use-disabled";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getLocationsForCreateAndEdit } from "~/modules/asset/service.server";
import { getKit, updateKitLocation } from "~/modules/kit/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import { payload, getParams, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export const meta: MetaFunction = ({ matches }: { matches: any[] }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match: any) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.kits.updateLocationTitle) }];
};

const ParamsSchema = z.object({ kitId: z.string() });

const UpdateLocationSchema = z.object({
  currentLocationId: z.string().optional(),
  newLocationId: z.string(),
});

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const { userId } = context.getSession();
  const { kitId } = getParams(params, ParamsSchema);

  try {
    const { organizationId, userOrganizations } = await requirePermission({
      request,
      userId,
      entity: PermissionEntity.kit,
      action: PermissionAction.update,
    });

    const kit = await getKit({
      id: kitId,
      organizationId,
      userOrganizations,
      extraInclude: {
        _count: { select: { assetKits: true } },
      },
    });

    const { locations, totalLocations } = await getLocationsForCreateAndEdit({
      organizationId,
      request,
      defaultLocation: kit?.locationId,
    });

    return payload({
      showModal: true,
      kit,
      locations,
      totalLocations,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, kitId });
    throw reason;
  }
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const { userId } = context.getSession();
  const { kitId } = getParams(params, ParamsSchema);

  try {
    const { organizationId } = await requirePermission({
      request,
      userId,
      entity: PermissionEntity.kit,
      action: PermissionAction.update,
    });

    const formData = await request.formData();
    const payload = parseData(formData, UpdateLocationSchema);

    await updateKitLocation({
      id: kitId,
      organizationId,
      currentLocationId: payload.currentLocationId ?? null,
      newLocationId: payload.newLocationId,
      userId,
    });

    sendNotification({
      title: "Location updated",
      message: "Your kit's location has been updated successfully",
      icon: { name: "success", variant: "success" },
      senderId: userId,
    });

    return redirect(`/kits/${kitId}/assets`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, kitId });
    return reason;
  }
}

export default function UpdateKitLocation() {
  const { t } = useTranslation();
  const disabled = useDisabled();
  const { kit } = useLoaderData<typeof loader>();

  return (
    <Form method="post">
      <div className="modal-content-wrapper">
        <div className="mb-2 inline-flex items-center justify-center rounded-full border-8 border-solid border-primary-50 bg-primary-100 p-2 text-primary-600">
          <MapPinIcon />
        </div>
        <div className="mb-5">
          <h4>{t("assetActions.updateLocation")}</h4>
          <p>
            Adjust the location of{" "}
            <span className="font-medium">{kit.name}</span>.
          </p>
          {kit._count.assetKits > 0 && (
            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> This will also update the location of all{" "}
                <span className="font-medium">
                  {kit._count.assetKits} asset
                  {kit._count.assetKits > 1 ? "s" : ""}
                </span>{" "}
                within this kit.
              </p>
            </div>
          )}
        </div>
        <div className=" relative z-50 mb-8">
          <LocationSelect isBulk={false} locationId={kit?.locationId} />
        </div>

        <div className="flex gap-3">
          <Button to=".." variant="secondary" width="full" disabled={disabled}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            width="full"
            type="submit"
            disabled={disabled}
          >
            {t("common.confirm")}
          </Button>
        </div>
      </div>
    </Form>
  );
}
