/**
 * @file Entry point for the bulk asset update page (/assets/import-update).
 * Renders instructional UI explaining the CSV-based bulk update workflow
 * and embeds the {@link UpdateImportForm} for the upload/preview/apply flow.
 *
 * @see {@link file://./form.tsx} Upload/preview/apply orchestration
 * @see {@link file://./../../../routes/_layout+/assets.import-update.tsx} Route handler
 */
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { UpdateImportForm } from "./form";
import Icon from "../../icons/icon";
import { Button } from "../../shared/button";

/**
 * Main content component for the bulk asset update page.
 * Displays step-by-step instructions (collapsible after analysis)
 * and embeds the CSV upload form.
 */
export const ImportUpdateContent = () => {
  const { t } = useTranslation();
  const [showInstructions, setShowInstructions] = useState(true);

  return (
    <div className="w-full text-start">
      <h3>{t("assetUpdate.title")}</h3>
      <p>{t("assetUpdate.intro")}</p>

      {showInstructions ? (
        <>
          {/* Step 1: Get the CSV */}
          <div className="my-4 flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
            <Icon
              icon="download"
              size="xs"
              className="shrink-0 text-gray-500"
            />
            <div className="flex-1">
              <p className="text-[14px] text-gray-600">
                <Trans
                  i18nKey="assetUpdate.step1"
                  components={{
                    1: <b />,
                    3: <Button variant="link" to="/assets" />,
                    5: <b />,
                    7: <b />,
                  }}
                />
              </p>
            </div>
            <Button variant="secondary" to="/assets">
              {t("assetUpdate.goToAssetIndex")}
            </Button>
          </div>

          <div className="my-5 flex flex-col gap-4">
            {/* What you can update */}
            <div className="flex gap-3">
              <Icon
                icon="pen"
                size="xs"
                className="mt-0.5 shrink-0 text-gray-500"
              />
              <div>
                <h5 className="font-semibold">
                  {t("assetUpdate.whatYouCanUpdate")}
                </h5>
                <p className="text-[14px] text-gray-600">
                  {t("assetUpdate.whatYouCanUpdateBody")}
                </p>
                <p className="mt-1 text-[14px] text-gray-600">
                  <Trans
                    i18nKey="assetUpdate.notSupported"
                    components={{ 1: <b /> }}
                  />
                </p>
              </div>
            </div>

            {/* Empty cells */}
            <div className="flex gap-3">
              <Icon
                icon="check"
                size="xs"
                className="mt-0.5 shrink-0 text-gray-500"
              />
              <div>
                <h5 className="font-semibold">
                  {t("assetUpdate.emptyCellsClear")}
                </h5>
                <p className="text-[14px] text-gray-600">
                  {t("assetUpdate.emptyCellsClearBody")}
                </p>
              </div>
            </div>

            {/* Matching */}
            <div className="flex gap-3">
              <Icon
                icon="asset"
                size="xs"
                className="mt-0.5 shrink-0 text-gray-500"
              />
              <div>
                <h5 className="font-semibold">{t("assetUpdate.howMatched")}</h5>
                <p className="text-[14px] text-gray-600">
                  <Trans
                    i18nKey="assetUpdate.howMatchedBody"
                    components={{ 1: <b />, 3: <b /> }}
                  />
                </p>
              </div>
            </div>

            {/* Limits */}
            <div className="flex gap-3">
              <Icon
                icon="settings"
                size="xs"
                className="mt-0.5 shrink-0 text-gray-500"
              />
              <div>
                <h5 className="font-semibold">{t("assetUpdate.limits")}</h5>
                <p className="text-[14px] text-gray-600">
                  <Trans
                    i18nKey="assetUpdate.limitsBody"
                    components={{ 1: <b /> }}
                  />
                </p>
              </div>
            </div>
          </div>

          <p className="text-[14px] text-gray-500">
            <Trans
              i18nKey="assetUpdate.tip"
              components={{
                1: <b />,
                3: <Button variant="link" to="/assets" />,
                5: <b />,
              }}
            />
          </p>

          <p className="mt-1 text-[14px] text-gray-400">
            <Trans
              i18nKey="assetUpdate.createInstead"
              components={{ 1: <Button variant="link" to="/assets/import" /> }}
            />
          </p>
        </>
      ) : (
        <button
          type="button"
          className="my-2 text-sm text-gray-500 underline"
          onClick={() => setShowInstructions(true)}
        >
          {t("assetUpdate.showInstructions")}
        </button>
      )}

      <UpdateImportForm
        onStageChange={(stage) => {
          if (stage === "preview" || stage === "results") {
            setShowInstructions(false);
          } else if (stage === "upload") {
            setShowInstructions(true);
          }
        }}
      />
    </div>
  );
};
