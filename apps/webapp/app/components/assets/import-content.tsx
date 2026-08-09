/**
 * @file CSV upload form for the admin dashboard's per-organization import.
 *
 * The workspace-facing `ImportContent` that used to live here is gone: EPDA
 * books stock in on مذكرة/محضر استلام, and `/assets/import` is now a redirect
 * (see `assets.import.tsx` for why closing the bulk door mattered as much as
 * the single one).
 *
 * `FileForm` survives because the admin dashboard still restores an
 * organization from a backup CSV — an app-wide-admin recovery tool, not an
 * intake path, and one that predates the receipt forms.
 *
 * @see {@link file://./../../routes/_layout+/admin-dashboard+/org.$organizationId.tsx} the sole consumer
 * @see {@link file://./../../routes/api+/admin.import-org-assets.$organizationId.tsx} the endpoint it posts to
 */
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { useDisabled } from "~/hooks/use-disabled";
import useFetcherWithReset from "~/hooks/use-fetcher-with-reset";
import type { DuplicateBarcode } from "~/modules/barcode/service.server";
import type { QRCodePerImportedAsset } from "~/modules/qr/service.server";
import type { action } from "~/routes/api+/admin.import-org-assets.$organizationId";
import Input from "../forms/input";
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
import { Table, Td, Th, Tr } from "../table";
import When from "../when/when";

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
  const disabled = isSubmitting || agreed !== t("ui.iAgree");
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
                  placeholder={t("ui.iAgree")}
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
                  {isSubmitting ? "Importing..." : t("common.import")}
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
