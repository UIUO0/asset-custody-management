/**
 * @file Import content components for CSV asset import.
 * Provides the main ImportContent layout and FileForm for file upload
 * with client-side validation, preview, and confirmation flow.
 *
 * @see {@link file://./../../routes/_layout+/assets.import.tsx} Route handler
 */
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { useDisabled } from "~/hooks/use-disabled";
import useFetcherWithReset from "~/hooks/use-fetcher-with-reset";
import type { DuplicateBarcode } from "~/modules/barcode/service.server";
import type { QRCodePerImportedAsset } from "~/modules/qr/service.server";
import type { action } from "~/routes/_layout+/assets.import";
import { useBarcodePermissions } from "~/utils/permissions/use-barcode-permissions";
import Input from "../forms/input";
import Icon from "../icons/icon";
import { Button } from "../shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../shared/modal";
import { WarningBox } from "../shared/warning-box";
import { Table, Td, Th, Tr } from "../table";
import When from "../when/when";

/**
 * Main content component for the CSV asset import page.
 * Displays instructions, rules, and embeds the FileForm for upload.
 */
export const ImportContent = () => {
  const { t } = useTranslation();
  const { canUseBarcodes } = useBarcodePermissions();

  return (
    <div className="w-full text-start">
      <h3>{t("assetImport.title")}</h3>

      {/* Intent fork */}
      <div className="my-4 flex gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
        <Icon
          icon="switch"
          size="xs"
          className="mt-0.5 shrink-0 text-gray-500"
        />
        <p className="text-[14px] text-gray-600">
          <Trans
            i18nKey="assetImport.updateForkText"
            components={{
              1: <b />,
              3: <Button variant="link" to="/assets/import-update" />,
            }}
          />
        </p>
      </div>

      <h4>{t("assetImport.createHeading")}</h4>
      <p>
        <Trans
          i18nKey="assetImport.createIntro"
          components={{
            1: (
              <Button
                variant="link"
                to={
                  canUseBarcodes
                    ? "/static/epda-example-asset-import-from-content-with-barcodes.csv"
                    : "/static/epda-example-asset-import-from-content.csv"
                }
                target="_blank"
                download
              />
            ),
          }}
        />
      </p>

      <WarningBox className="my-4">
        <Trans i18nKey="assetImport.warning" components={{ 1: <strong /> }} />
      </WarningBox>

      <div className="my-5 flex flex-col gap-4">
        {/* Base rules */}
        <div className="flex gap-3">
          <Icon
            icon="write"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">{t("assetImport.baseRulesTitle")}</h5>
            <ul className="list-inside list-disc text-[14px] text-gray-600">
              <li>
                <Trans
                  i18nKey="assetImport.baseRuleDelimiter"
                  components={{ 1: <b />, 3: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.baseRuleRelations"
                  components={{ 1: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.baseRuleTags"
                  components={{ 1: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.baseRuleNewOnly"
                  components={{ 1: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.baseRuleQtyPointer"
                  components={{ 1: <b /> }}
                />
              </li>
            </ul>
          </div>
        </div>

        {/* Custom fields */}
        <div className="flex gap-3">
          <Icon
            icon="settings"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">
              {t("assetImport.customFieldsTitle")}
            </h5>
            <p className="text-[14px] text-gray-600">
              <Trans
                i18nKey="assetImport.customFieldsIntro"
                components={{ 1: <b /> }}
              />
            </p>
            <ul className="list-inside list-disc ps-2 text-[14px] text-gray-600">
              <li>
                <Trans
                  i18nKey="assetImport.customFieldTypesBasic"
                  components={{ 1: <b />, 3: <b />, 5: <b />, 7: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.customFieldDate"
                  components={{ 1: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.customFieldAmount"
                  components={{ 1: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.customFieldNumber"
                  components={{ 1: <b /> }}
                />
              </li>
            </ul>
            <p className="mt-1 text-[14px] text-gray-600">
              <Trans
                i18nKey="assetImport.customFieldExample"
                components={{ 1: <b /> }}
              />
            </p>
          </div>
        </div>

        {/* QR codes */}
        <div className="flex gap-3">
          <Icon
            icon="scanQR"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">{t("assetImport.qrTitle")}</h5>
            <p className="text-[14px] text-gray-600">
              {t("assetImport.qrIntro")}
            </p>
            <ul className="list-inside list-disc ps-2 text-[14px] text-gray-600">
              <li>
                <Trans
                  i18nKey="assetImport.qrRuleExisting"
                  components={{ 1: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.qrRuleNoDuplicates"
                  components={{ 1: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.qrRuleNotLinked"
                  components={{ 1: <b /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.qrRuleOwnership"
                  components={{ 1: <b /> }}
                />
              </li>
            </ul>
            <p className="mt-1 text-[14px] text-gray-600">
              <Trans
                i18nKey="assetImport.qrFallback"
                components={{ 1: <b /> }}
              />
            </p>
          </div>
        </div>

        {/* Barcodes */}
        <When truthy={canUseBarcodes}>
          <div className="flex gap-3">
            <Icon
              icon="barcode"
              size="xs"
              className="mt-0.5 shrink-0 text-gray-500"
            />
            <div>
              <h5 className="font-semibold">
                {t("assetImport.barcodesTitle")}
              </h5>
              <p className="text-[14px] text-gray-600">
                {t("assetImport.barcodesIntro")}
              </p>
              <ul className="list-inside list-disc ps-2 text-[14px] text-gray-600">
                <li>
                  <Trans
                    i18nKey="assetImport.barcodeCode128"
                    components={{ 1: <b /> }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="assetImport.barcodeCode39"
                    components={{ 1: <b /> }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="assetImport.barcodeDataMatrix"
                    components={{ 1: <b /> }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="assetImport.barcodeExternalQR"
                    components={{ 1: <b /> }}
                  />
                </li>
                <li>
                  <Trans
                    i18nKey="assetImport.barcodeEAN13"
                    components={{ 1: <b /> }}
                  />
                </li>
              </ul>
              <p className="mt-1 text-[14px] text-gray-600">
                <Trans
                  i18nKey="assetImport.barcodeRules"
                  components={{ 1: <b /> }}
                />
              </p>
            </div>
          </div>
        </When>

        {/* Quantity-tracked assets + asset model columns */}
        <div className="flex gap-3">
          <Icon
            icon="asset"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">{t("assetImport.qtyTitle")}</h5>
            <p className="text-[14px] text-gray-600">
              {t("assetImport.qtyIntro")}
            </p>
            <ul className="list-inside list-disc ps-2 text-[14px] text-gray-600">
              <li>
                <Trans
                  i18nKey="assetImport.qtyColType"
                  components={{
                    1: <b />,
                    3: <code />,
                    5: <code />,
                    7: <b />,
                  }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.qtyColQuantity"
                  components={{ 1: <b />, 3: <code />, 5: <code /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.qtyColMinQuantity"
                  components={{ 1: <b />, 3: <code /> }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.qtyColUnitOfMeasure"
                  components={{
                    1: <b />,
                    3: <code />,
                    5: <code />,
                    7: <code />,
                  }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.qtyColConsumptionType"
                  components={{
                    1: <b />,
                    3: <code />,
                    5: <code />,
                    7: <code />,
                    9: <code />,
                  }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="assetImport.qtyColAssetModel"
                  components={{ 1: <b />, 3: <b />, 5: <code /> }}
                />
              </li>
            </ul>
            <p className="mt-1 text-[14px] text-gray-600">
              <Trans
                i18nKey="assetImport.qtyTip"
                components={{
                  1: <b />,
                  3: <code />,
                  5: <code />,
                  7: <code />,
                  9: <code />,
                  11: <code />,
                }}
              />
            </p>
          </div>
        </div>

        {/* Extra considerations */}
        <div className="flex gap-3">
          <Icon
            icon="question"
            size="xs"
            className="mt-0.5 shrink-0 text-gray-500"
          />
          <div>
            <h5 className="font-semibold">
              {t("assetImport.goodToKnowTitle")}
            </h5>
            <ul className="list-inside list-disc text-[14px] text-gray-600">
              <li>{t("assetImport.goodToKnowHeaders")}</li>
              <li>{t("assetImport.goodToKnowAllOrNothing")}</li>
            </ul>
          </div>
        </div>
      </div>

      <FileForm intent={"content"} />
    </div>
  );
};

/**
 * File upload form with confirmation dialog for CSV asset import.
 * Handles file selection, "I AGREE" confirmation, and displays
 * import errors or success state.
 *
 * @param intent - The form intent value sent to the action
 * @param url - Optional custom action URL for the form
 */
export const FileForm = ({ intent, url }: { intent: string; url?: string }) => {
  const { t } = useTranslation();
  // Widened to `string` so toUpperCase() doesn't need a cast.
  // The "I AGREE" check happens at submit time.
  const [agreed, setAgreed] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const fetcher = useFetcherWithReset<typeof action>();

  const { data } = fetcher;
  const isSubmitting = useDisabled(fetcher);
  const disabled = isSubmitting || agreed !== "I AGREE";
  const isSuccessful = data && !data.error;
  //

  // Focus the "I AGREE" confirmation input when the dialog opens (replaces
  // `autoFocus`). Re-focuses each time the dialog re-opens; skipped while
  // the success state is showing.
  const agreeInputRef = useAutoFocus<HTMLInputElement>({
    when: isDialogOpen && !isSuccessful,
  });

  /** We use a controlled field for the file, because of the confirmation dialog we have.
   * That way we can disabled the confirmation dialog button until a file is selected
   */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event?.target?.files?.[0];
    if (selectedFile) {
      setSelectedFile(selectedFile);
    }
  };

  return (
    <fetcher.Form
      className="mt-4 w-full"
      method="post"
      ref={formRef}
      encType="multipart/form-data"
      action={url ? url : undefined}
    >
      <Input
        type="file"
        name="file"
        label={t("assetImport.selectCsvFile")}
        required
        onChange={handleFileSelect}
        accept=".csv"
      />
      <input type="hidden" name="intent" value={intent} />

      <AlertDialog
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            // Reset form state when dialog is closed
            setAgreed("");
            fetcher.reset();
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            title={t("assetImport.confirmTitle")}
            disabled={!selectedFile}
            className="my-4"
          >
            {t("assetImport.confirmTitle")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-[600px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assetImport.confirmTitle")}</AlertDialogTitle>
            {!isSuccessful ? (
              <>
                <AlertDialogDescription>
                  <Trans
                    i18nKey="assetImport.agreeText"
                    components={{ 1: <b /> }}
                  />
                </AlertDialogDescription>
                <Input
                  type="text"
                  label={t("assetImport.confirmationLabel")}
                  ref={agreeInputRef}
                  name="agree"
                  value={agreed}
                  onChange={(e) => setAgreed(e.target.value.toUpperCase())}
                  placeholder="I AGREE"
                  pattern="^I AGREE$" // We use a regex to make sure the user types the exact string
                  required
                  onKeyDown={(e) => {
                    if (e.key == "Enter") {
                      e.preventDefault();
                      // Because we use a Dialog the submit buttons is outside of the form so we submit using the fetcher directly
                      if (!disabled) {
                        void fetcher.submit(formRef.current);
                      }
                    }
                  }}
                />
              </>
            ) : null}
          </AlertDialogHeader>

          <When truthy={!!data?.error}>
            <div className="overflow-y-scroll">
              <h5 className="text-red-500">{data?.error?.title}</h5>
              <p className="text-red-500">{data?.error?.message}</p>
              {data?.error?.additionalData?.duplicateCodes ? (
                <BrokenQrCodesTable
                  title={t("assetImport.duplicateCodes")}
                  data={
                    data.error.additionalData
                      .duplicateCodes as QRCodePerImportedAsset[]
                  }
                />
              ) : null}
              {data?.error?.additionalData?.nonExistentCodes ? (
                <BrokenQrCodesTable
                  title={t("assetImport.nonExistentCodes")}
                  data={
                    data.error.additionalData
                      .nonExistentCodes as QRCodePerImportedAsset[]
                  }
                />
              ) : null}
              {data?.error?.additionalData?.linkedCodes ? (
                <BrokenQrCodesTable
                  title={t("assetImport.alreadyLinkedCodes")}
                  data={
                    data.error.additionalData
                      .linkedCodes as QRCodePerImportedAsset[]
                  }
                />
              ) : null}
              {data?.error?.additionalData?.connectedToOtherOrgs ? (
                <BrokenQrCodesTable
                  title={t("assetImport.foreignOrgCodes")}
                  data={
                    data.error.additionalData
                      .connectedToOtherOrgs as QRCodePerImportedAsset[]
                  }
                />
              ) : null}

              {data?.error?.additionalData?.duplicateBarcodes ? (
                <DuplicateBarcodesTable
                  data={
                    data.error.additionalData
                      .duplicateBarcodes as DuplicateBarcode[]
                  }
                />
              ) : null}

              {data?.error?.additionalData?.kitCustodyConflicts ? (
                <table className="mt-4 w-full rounded-md border text-start text-sm">
                  <thead className="bg-error-100 text-xs">
                    <tr>
                      <th scope="col" className="px-2 py-1">
                        {t("assetImport.colAsset")}
                      </th>
                      <th scope="col" className="px-2 py-1">
                        {t("assetImport.colCustodian")}
                      </th>
                      <th scope="col" className="px-2 py-1">
                        {t("assetImport.colKit")}
                      </th>
                      <th scope="col" className="px-2 py-1">
                        {t("assetImport.colIssue")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      data.error.additionalData.kitCustodyConflicts as Array<{
                        asset: string;
                        custodian: string;
                        kit: string;
                        issue: string;
                      }>
                    ).map((conflict) => (
                      <tr
                        // Compose a stable key from the conflict fields —
                        // the backend can surface the same asset twice
                        // for different issues, so include `issue` too.
                        key={`${conflict.asset}-${conflict.kit}-${conflict.custodian}-${conflict.issue}`}
                        className="border-b"
                      >
                        <td className="px-2 py-1">{conflict.asset}</td>
                        <td className="px-2 py-1">{conflict.custodian}</td>
                        <td className="px-2 py-1">{conflict.kit}</td>
                        <td className="px-2 py-1">{conflict.issue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {Array.isArray(data?.error?.additionalData?.defectedHeaders) ? (
                <table className="mt-4 w-full rounded-md border text-start text-sm">
                  <thead className="bg-error-100 text-xs">
                    <tr>
                      <th scope="col" className="px-2 py-1">
                        {t("assetImport.colIncorrectHeader")}
                      </th>
                      <th scope="col" className="px-2 py-1">
                        {t("assetImport.colError")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.error?.additionalData?.defectedHeaders?.map(
                      (data: {
                        incorrectHeader: string;
                        errorMessage: string;
                      }) => (
                        <tr key={data.incorrectHeader}>
                          <td className="px-2 py-1">{data.incorrectHeader}</td>
                          <td className="px-2 py-1">{data.errorMessage}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              ) : null}

              <p className="mt-2">{t("assetImport.fixAndRetry")}</p>
            </div>
          </When>

          <When truthy={isSuccessful}>
            <div>
              <b className="text-green-500">{t("assetImport.success")}</b>
              <p>{t("assetImport.successBody")}</p>
            </div>
          </When>

          <AlertDialogFooter>
            {isSuccessful ? (
              <div className="flex gap-2">
                <AlertDialogCancel asChild>
                  <Button type="button" variant="secondary" width="full">
                    {t("common.close")}
                  </Button>
                </AlertDialogCancel>
                <Button to="/assets" width="full" className="whitespace-nowrap">
                  {t("assetImport.viewNewAssets")}
                </Button>
              </div>
            ) : (
              <>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="secondary">
                    {t("common.cancel")}
                  </Button>
                </AlertDialogCancel>
                <Button
                  type="submit"
                  onClick={() => {
                    // Because we use a Dialog the submit buttons is outside of the form so we submit using the fetcher directly
                    void fetcher.submit(formRef.current);
                  }}
                  disabled={disabled}
                >
                  {isSubmitting
                    ? t("assetImport.importing")
                    : t("common.import")}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fetcher.Form>
  );
};

function BrokenQrCodesTable({
  title,
  data,
}: {
  title: string;
  data: QRCodePerImportedAsset[];
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-3">
      <h5>{title}</h5>
      <Table className="mt-1 [&_td]:p-1 [&_th]:p-1">
        <thead>
          <Tr>
            <Th>{t("assetImport.assetTitle")}</Th>
            <Th>{t("assetImport.qrId")}</Th>
          </Tr>
        </thead>
        <tbody>
          {data.map((code: { title: string; qrId: string }) => (
            <Tr key={code.title}>
              <Td>{code.title}</Td>
              <Td>{code.qrId}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function DuplicateBarcodesTable({ data }: { data: DuplicateBarcode[] }) {
  const { t } = useTranslation();

  return (
    <div className="mt-3">
      <h5>{t("assetImport.duplicateBarcodes")}</h5>
      <Table className="mt-1 [&_td]:p-1 [&_th]:p-1">
        <thead>
          <Tr>
            <Th>{t("assetImport.barcode")}</Th>
            <Th>{t("assetImport.usedByAssets")}</Th>
          </Tr>
        </thead>
        <tbody>
          {data.map((barcode) => (
            <Tr key={barcode.value}>
              <Td className="align-top">{barcode.value}</Td>
              <Td className="whitespace-normal">
                <ul className="list-disc ps-4">
                  {barcode.assets.map((asset) => (
                    // CSV `row` number is unique per imported asset
                    // within a single error payload, so it's a stable
                    // key (include title+type to be extra safe if the
                    // same row ever surfaces under multiple barcodes).
                    <li key={`${asset.row}-${asset.type}-${asset.title}`}>
                      {t("assetImport.barcodeAssetLine", {
                        title: asset.title,
                        type: asset.type,
                        row: asset.row,
                      })}
                    </li>
                  ))}
                </ul>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
