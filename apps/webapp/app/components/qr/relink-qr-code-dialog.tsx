import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";
import { useScannerCameraId } from "~/hooks/use-scanner-camera-id";
import { isFormProcessing } from "~/utils/form";
import Icon from "../icons/icon";
import { ArrowLeftIcon, ArrowRightIcon } from "../icons/library";
import { Dialog, DialogPortal } from "../layout/dialog";
import type { OnCodeDetectionSuccessProps } from "../scanner/code-scanner";
import { CodeScanner } from "../scanner/code-scanner";
import { Button } from "../shared/button";
import When from "../when/when";

export type RelinkQrCodeActionData = {
  success: boolean;
  error?: { message: string };
};

type RelinkQrCodeDialogProps = {
  open: boolean;
  onClose: () => void;
  itemName: string;
  currentQrId?: string;
  itemLabel?: string;
  actionData?: RelinkQrCodeActionData | null;
};

type CurrentState = "initial" | "qr-selected";

export function RelinkQrCodeDialog({
  open,
  onClose,
  itemName,
  currentQrId,
  itemLabel = "item",
  actionData,
}: RelinkQrCodeDialogProps) {
  const { t } = useTranslation();
  const [currentState, setCurrentState] = useState<CurrentState>("initial");
  const [newQrId, setNewQrId] = useState<string>();
  const [errorMessage, setErrorMessage] = useState("");

  const navigation = useNavigation();
  const isSubmitting = isFormProcessing(navigation.state);

  const savedCameraId = useScannerCameraId();

  const isNewCodeSameAsCurrent = currentQrId === newQrId;

  function handleQrDetectionSuccess({
    value: qrId,
    error,
    type,
  }: OnCodeDetectionSuccessProps) {
    if (type === "barcode") {
      setErrorMessage(t("qr.scanQrNotBarcode"));
      return;
    }

    if (error && error !== "") {
      setErrorMessage(error);
    }

    setNewQrId(qrId);

    if (currentQrId === qrId) {
      setErrorMessage(
        `The new code you scanned is the same as the current code of the ${itemLabel}. Please scan a different code.`,
      );
    }
  }

  const handleClose = useCallback(() => {
    setNewQrId(undefined);
    setCurrentState("initial");
    setErrorMessage("");
    onClose();
  }, [onClose]);

  useEffect(
    function closeOnSuccess() {
      if (!actionData?.error && actionData?.success === true) {
        handleClose();
      }
    },
    [actionData, handleClose],
  );

  useEffect(
    function showActionError() {
      if (actionData?.error) {
        setErrorMessage(actionData.error.message);
      }
    },
    [actionData?.error],
  );

  return (
    <DialogPortal>
      <Dialog
        open={open}
        onClose={handleClose}
        title={
          <>
            <When truthy={currentState === "initial"}>
              <div>
                <h3>{t("qr.changeQrCodeTitle")}</h3>
                <p className="text-gray-600">{itemName}</p>
              </div>
            </When>
            <When truthy={currentState === "qr-selected"}>
              <div className="flex items-center justify-center rounded-lg border border-gray-200 p-4 shadow-lg">
                <Icon icon="change" />
              </div>
            </When>
          </>
        }
        className="[&_.dialog-body]:flex [&_.dialog-body]:flex-col"
      >
        <When truthy={currentState === "initial"}>
          <>
            <CodeScanner
              className="!h-[450px] [&_.info-overlay]:h-[450px]"
              overlayClassName="md:h-[320px] max-w-xs"
              isLoading={false}
              onCodeDetectionSuccess={handleQrDetectionSuccess}
              allowNonShelfCodes
              hideBackButtonText
              paused={!!newQrId}
              setPaused={() => {}}
              scannerModeClassName="h-[450px]"
              scannerModeCallback={() => {}}
              savedCameraId={savedCameraId}
            />

            <div className="flex items-center justify-center gap-4 border-b border-gray-200 p-4">
              <div className="flex-1 truncate text-end">
                <p className="uppercase text-gray-500">{t("qr.currentCode")}</p>
                <p
                  className="truncate font-medium"
                  title={currentQrId ? currentQrId : t("qr.notLinkedYet")}
                >
                  {currentQrId ? currentQrId : t("qr.notLinkedYet")}
                </p>
              </div>
              <div className="flex items-center justify-center rounded-lg border border-gray-200 p-2.5 shadow-lg">
                <ArrowRightIcon />
              </div>
              <div className="flex-1 truncate">
                <p className="uppercase text-gray-500">{t("ui.newCode")}</p>
                <p
                  className="truncate font-medium"
                  title={newQrId ? newQrId : t("qr.scanToLink")}
                >
                  {newQrId ? newQrId : t("qr.scanToLink")}
                </p>
              </div>
            </div>

            <When truthy={!!errorMessage}>
              <p className="mt-4 px-8 text-center text-sm text-error-500">
                {errorMessage}
              </p>
            </When>

            <div className="flex items-center gap-4 p-4">
              <Button
                type="button"
                className="flex-1"
                variant="secondary"
                disabled={!newQrId}
                onClick={() => {
                  setNewQrId(undefined);
                  setErrorMessage("");

                  if (document) {
                    const input = document.querySelector(
                      ".scanner-mode-input",
                    ) as HTMLInputElement;
                    if (input) {
                      input.disabled = false;
                      input.focus();
                      input.value = "";
                    }
                  }
                }}
              >
                {t("ui.rescan")}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={!newQrId || isNewCodeSameAsCurrent || !!errorMessage}
                onClick={() => {
                  setCurrentState("qr-selected");
                }}
              >
                Link
              </Button>
            </div>
          </>
        </When>
        <When truthy={currentState === "qr-selected"}>
          <div className="p-6">
            <div className="mb-5">
              <h3>{t("qr.changeQrCode")}</h3>
              <p>
                Are you sure you want to relink the code for{" "}
                <span className="font-bold">{itemName}</span>? The current code
                will become unlinked.
              </p>
            </div>

            <div className="mb-1 flex items-center gap-2.5 rounded border border-gray-200 p-2">
              <div className="flex items-center justify-center rounded-lg border border-gray-200 p-2.5">
                <ArrowLeftIcon />
              </div>
              <div>
                <p className="uppercase text-gray-600">{t("qr.currentCode")}</p>
                <p className="font-medium">{currentQrId ?? "N/A"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded border border-gray-200 p-2">
              <div className="flex items-center justify-center rounded-lg border border-gray-200 p-2.5">
                <ArrowRightIcon />
              </div>
              <div>
                <p className="uppercase text-gray-600">{t("ui.newCode")}</p>
                <p className="font-medium">{newQrId}</p>
              </div>
            </div>

            <When truthy={!!errorMessage}>
              <p className="mt-4 px-8 text-center text-sm text-error-500">
                {errorMessage}
              </p>
            </When>

            <div className="mt-8 flex items-center gap-3">
              <Button
                type="button"
                className="flex-1"
                variant="secondary"
                onClick={() => {
                  setNewQrId(undefined);
                  setCurrentState("initial");
                  setErrorMessage("");
                }}
              >
                {t("ui.rescan")}
              </Button>
              <Form method="post" className="flex-1">
                <input type="hidden" value={newQrId} name="newQrId" />
                <input type="hidden" value="relink-qr-code" name="intent" />

                <Button
                  className="w-full"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {t("common.confirm")}
                </Button>
              </Form>
            </div>
          </div>
        </When>
      </Dialog>
    </DialogPortal>
  );
}
