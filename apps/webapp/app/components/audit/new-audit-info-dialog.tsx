import { useState } from "react";
import { CompassIcon, MapPinIcon, PackageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogPortal } from "~/components/layout/dialog";
import { Button } from "~/components/shared/button";

export function NewAuditInfoDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleClose = () => setOpen(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {t("audits.newAudit")}
      </Button>
      <DialogPortal>
        <Dialog
          open={open}
          onClose={handleClose}
          className="w-full sm:w-[500px]"
          title={
            <h3 className="text-lg font-semibold">{t("ui.createANewAudit")}</h3>
          }
        >
          <div className="px-6 pb-6">
            <p className="mb-6 text-sm text-gray-600">
              {t("audits.infoIntro")}
            </p>

            <div className="space-y-4">
              {/* From Assets */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                    <CompassIcon className="size-5 text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="mb-1 font-medium text-gray-900">
                      {t("audits.fromAssetsList")}
                    </h4>
                    <p className="mb-3 text-sm text-gray-600">
                      {t("audits.fromAssetsListHint")}
                    </p>
                    <Button
                      to="/assets"
                      variant="secondary"
                      size="xs"
                      onClick={handleClose}
                    >
                      {t("ui.goToAssets")}
                    </Button>
                  </div>
                </div>
              </div>

              {/* From Location */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <MapPinIcon className="size-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="mb-1 font-medium text-gray-900">
                      {t("ui.fromLocations")}
                    </h4>
                    <p className="mb-3 text-sm text-gray-600">
                      Audit the assets across one or more locations. Ideal for
                      room-by-room or area-based inventory checks. Select the
                      locations you want on the Locations page, then choose
                      Actions → Create audit.
                    </p>
                    <Button
                      to="/locations"
                      variant="secondary"
                      size="xs"
                      onClick={handleClose}
                    >
                      {t("ui.goToLocations")}
                    </Button>
                  </div>
                </div>
              </div>

              {/* From Kit */}
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-50">
                    <PackageIcon className="size-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="mb-1 font-medium text-gray-900">
                      {t("ui.fromKits")}
                    </h4>
                    <p className="mb-3 text-sm text-gray-600">
                      Audit the assets across one or more kits. Great for
                      verifying that kit contents are complete. Select kits on
                      the Kits page, then choose Actions → Create audit.
                    </p>
                    <Button
                      to="/kits"
                      variant="secondary"
                      size="xs"
                      onClick={handleClose}
                    >
                      {t("ui.goToKits")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Dialog>
      </DialogPortal>
    </>
  );
}
