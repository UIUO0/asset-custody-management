import React, { useRef, useMemo, useState, useEffect } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { BarcodeType } from "@prisma/client";
import { changeDpiDataUrl } from "changedpi";
import { toPng } from "html-to-image";
import { useTranslation } from "react-i18next";
import { useReactToPrint } from "react-to-print";
import { BarcodeDisplay } from "~/components/barcode/barcode-display";
import { Button } from "~/components/shared/button";
import { config } from "~/config/shelf.config";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { resolveShowShelfBranding } from "~/utils/branding";
import { useBarcodePermissions } from "~/utils/permissions/use-barcode-permissions";
import { slugify } from "~/utils/slugify";
import { tw } from "~/utils/tw";
import { waitForImagesToLoad } from "~/utils/wait-for-images";
import { AddBarcodeDialog } from "./add-barcode-dialog";
import { Ean13LookupLink } from "../barcode/barcode-card";
import { UnlockBarcodesModal } from "../barcode/unlock-barcodes-banner";
import When from "../when/when";

type SizeKeys = "cable" | "small" | "medium" | "large";

export interface CodeType {
  id: string;
  type: "qr" | "barcode";
  label: string;
  // QR specific
  qrData?: {
    size: SizeKeys;
    src: string;
  };
  // Barcode specific
  barcodeData?: {
    type: BarcodeType;
    value: string;
  };
}

/**
 * Module-scope default for the `barcodes` prop. Using a fresh `[]` as the
 * default value triggers identity churn through `useMemo`/`useEffect` dep
 * arrays on every render, so we share a single frozen reference instead.
 */
const EMPTY_BARCODES: Array<{
  id: string;
  type: BarcodeType;
  value: string;
}> = [];

/** Shared frame/container style for QR + barcode labels (rendered for export/print). */
const LABEL_CONTAINER_STYLE: CSSProperties = {
  width: "300px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  gap: "12px",
  borderRadius: "4px",
  border: "5px solid #E3E4E8",
  padding: "24px 17px 24px 17px",
  backgroundColor: "white",
};

/** QR labels are square; barcode labels have a minimum height instead. */
const QR_LABEL_STYLE: CSSProperties = {
  ...LABEL_CONTAINER_STYLE,
  aspectRatio: "1 / 1",
};

const BARCODE_LABEL_STYLE: CSSProperties = {
  ...LABEL_CONTAINER_STYLE,
  minHeight: "300px",
};

/**
 * Authority logo at the foot of a label.
 *
 * Sized by width alone (the asset is 766×128, so height follows at ~18px) and
 * given explicit `auto` height so the aspect ratio survives the html-to-image
 * capture, which does not inherit every cascade rule.
 */
const LABEL_BRANDING_STYLE: CSSProperties = {
  width: "110px",
  height: "auto",
  // `display: block` + auto side margins rather than `text-align` on the
  // parent: the capture rasterises the element itself, so the centring must
  // hold on the image and not depend on inherited text alignment.
  display: "block",
  margin: "8px auto 0",
};

/** Title text at the top of a QR/barcode label — truncated, bold, centered. */
const LABEL_TITLE_STYLE: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%",
  color: "black",
  textAlign: "center",
};

interface CodePreviewProps {
  className?: string;
  style?: CSSProperties;
  hideButton?: boolean;
  item: {
    id: string; // Need the ID to construct the action URL
    name: string;
    type: "asset" | "kit";
  };
  qrObj?: {
    qr?: {
      size: SizeKeys;
      id: string;
      src: string;
    };
  };
  barcodes?: Array<{
    id: string;
    type: BarcodeType;
    value: string;
  }>;
  onCodeChange?: (code: CodeType | null) => void;
  selectedBarcodeId?: string;
  onRefetchData?: () => void; // Callback to refetch data when barcode is added
  sequentialId?: string | null;
  showShelfBranding?: boolean;
}

// react-doctor:no-giant-component — deferred for follow-up refactor
export const CodePreview = ({
  className,
  style,
  qrObj,
  barcodes = EMPTY_BARCODES,
  item,
  hideButton = false,
  onCodeChange,
  selectedBarcodeId,
  onRefetchData,
  sequentialId,
  showShelfBranding,
}: CodePreviewProps) => {
  const { t } = useTranslation();
  const captureDivRef = useRef<HTMLImageElement>(null);
  const downloadBtnRef = useRef<HTMLAnchorElement>(null);
  const { canUseBarcodes } = useBarcodePermissions();
  const { isScopedToOwnRecords, isOwner } = useUserRoleHelper();
  const organization = useCurrentOrganization();
  const resolvedShowShelfBranding = resolveShowShelfBranding(
    showShelfBranding,
    organization?.showShelfBranding,
  );
  const [isAddBarcodeDialogOpen, setIsAddBarcodeDialogOpen] = useState(false);

  // Build available codes list
  const availableCodes: CodeType[] = useMemo(() => {
    const codes: CodeType[] = [];

    // Add QR code if available
    if (qrObj?.qr) {
      codes.push({
        id: qrObj.qr.id,
        type: "qr",
        label: t("assetOverview.qrCode"),
        qrData: {
          size: qrObj.qr.size,
          src: qrObj.qr.src,
        },
      });
    }

    // Add barcodes if available and permissions allow
    if (canUseBarcodes) {
      barcodes.forEach((barcode) => {
        const isExternalQr = barcode.type === "ExternalQR";
        const label = isExternalQr
          ? t("qr.externalCode")
          : `${barcode.type} - ${barcode.value}`;

        codes.push({
          id: barcode.id,
          type: "barcode",
          label,
          barcodeData: {
            type: barcode.type,
            value: barcode.value,
          },
        });
      });
    }

    return codes;
  }, [qrObj, barcodes, canUseBarcodes, t]);

  // Default to selected barcode, then QR code if available, otherwise first barcode
  const [selectedCodeId, setSelectedCodeId] = useState<string>(() => {
    // If a specific barcode is selected, prioritize it
    if (selectedBarcodeId) {
      const selectedBarcode = availableCodes.find(
        (code) => code.id === selectedBarcodeId,
      );
      if (selectedBarcode) {
        return selectedBarcodeId;
      }
    }

    // Otherwise default to QR code if available, then first barcode
    const qrCode = availableCodes.find((code) => code.type === "qr");
    return qrCode?.id || availableCodes[0]?.id || "";
  });

  // Notify parent of initial selection (moved to useEffect to avoid render-time side effects)
  useEffect(() => {
    const selectedBarcode = availableCodes.find(
      (code) => code.id === selectedCodeId,
    );
    if (onCodeChange && selectedBarcode) {
      onCodeChange(selectedBarcode);
    }
  }, [selectedCodeId, availableCodes, onCodeChange]);

  const selectedCode = availableCodes.find(
    (code) => code.id === selectedCodeId,
  );

  useEffect(() => {
    // Keep selection in sync when codes change (e.g., new QR after relink)
    const hasSelectedCode = availableCodes.some(
      (code) => code.id === selectedCodeId,
    );

    if (hasSelectedCode) return;

    // Prefer the externally requested barcode, then fallback to QR, then any barcode
    const selectedBarcode = selectedBarcodeId
      ? availableCodes.find((code) => code.id === selectedBarcodeId)
      : undefined;

    if (selectedBarcode) {
      setSelectedCodeId(selectedBarcode.id);
      return;
    }

    const fallbackQr = availableCodes.find((code) => code.type === "qr");
    const fallbackBarcode = availableCodes.find(
      (code) => code.type === "barcode",
    );
    setSelectedCodeId(fallbackQr?.id || fallbackBarcode?.id || "");
  }, [availableCodes, selectedBarcodeId, selectedCodeId]);

  const fileName = useMemo(() => {
    if (!selectedCode) return "";

    const prefix = `${slugify(item.name || item.type)}`;
    if (selectedCode.type === "qr") {
      // The vendor name must not appear on anything the user sees, and a
      // download filename is about as visible as it gets.
      return `${prefix}-${selectedCode.qrData?.size}-qr-code-${selectedCode.id}.png`;
    } else {
      return `${prefix}-${selectedCode.barcodeData?.type}-barcode-${selectedCode.barcodeData?.value}.png`;
    }
  }, [item, selectedCode]);

  function downloadCode(e: MouseEvent<HTMLButtonElement>) {
    const captureDiv = captureDivRef.current;
    const downloadBtn = downloadBtnRef.current;

    if (captureDiv && downloadBtn) {
      e.preventDefault();

      const options = {
        height: captureDiv.offsetHeight * 2,
        width: captureDiv.offsetWidth * 2,
        cacheBust: true,
        style: {
          transform: `scale(${2})`,
          transformOrigin: "top left",
          width: `${captureDiv.offsetWidth}px`,
          height: `${captureDiv.offsetHeight}px`,
        },
      };

      // Safari/iPad workaround: html-to-image needs to be called twice
      // First call "primes" the rendering, second call captures correctly
      waitForImagesToLoad(captureDiv)
        .then(() => toPng(captureDiv, options)) // First call (prime)
        .then(() => toPng(captureDiv, options)) // Second call (actual capture)
        .then((dataUrl: string) => {
          const downloadLink = document.createElement("a");
          downloadLink.href = changeDpiDataUrl(dataUrl, 300);
          downloadLink.download = fileName;
          downloadLink.click();
          URL.revokeObjectURL(downloadLink.href);
        })
        // eslint-disable-next-line no-console
        .catch(console.error);
    }
  }

  const printCode = useReactToPrint({
    contentRef: captureDivRef,
    onBeforePrint: () => {
      const container = captureDivRef.current;
      if (!container) return Promise.resolve();
      return waitForImagesToLoad(container);
    },
  });

  // Don't render if no codes available
  if (availableCodes.length === 0) {
    return null;
  }

  return (
    <div
      className={tw("mb-4 w-auto rounded border bg-white", className)}
      style={style}
    >
      {/* Code Selector */}
      <div className="w-full border-b-[1.1px] border-[#E3E4E8] px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <select
            id="code-selector"
            aria-label={t("ui.selectCodeToDisplay")}
            value={selectedCodeId}
            onChange={(e) => {
              setSelectedCodeId(e.target.value);
              const newSelectedCode = availableCodes.find(
                (code) => code.id === e.target.value,
              );
              onCodeChange?.(newSelectedCode || null);
            }}
            className={tw(
              "min-w-0  flex-1 truncate rounded-md border border-gray-300 bg-white px-3 py-2 pe-7 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
              isScopedToOwnRecords ? "max-w-[320px]" : "max-w-[280px]",
            )}
          >
            {availableCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.label}
              </option>
            ))}
          </select>
          <When truthy={!isScopedToOwnRecords}>
            <Button
              type="button"
              icon="plus"
              variant="secondary"
              size="sm"
              onClick={() => setIsAddBarcodeDialogOpen(true)}
              aria-label={t("ui.addCodeToAsset")}
              disabled={
                !canUseBarcodes
                  ? {
                      reason: isOwner ? (
                        <>
                          Your workspace doesn't have the barcodes addon
                          enabled.{" "}
                          <UnlockBarcodesModal
                            triggerVariant="link"
                            triggerLabel={t("common.learnMore")}
                          />
                        </>
                      ) : (
                        <>
                          Your workspace doesn't currently support barcodes.
                          Contact your workspace owner to enable this feature,
                          or get in touch with إدارة تقنية المعلومات.
                        </>
                      ),
                    }
                  : false
              }
              tooltip={canUseBarcodes ? t("ui.addCodeToAsset") : undefined}
              className="shrink-0"
            />
          </When>
        </div>
      </div>

      {/* Code Preview */}
      <div className="flex w-full justify-center pt-6">
        {selectedCode?.type === "qr" ? (
          <QrLabel
            ref={captureDivRef}
            data={{ qr: { id: selectedCode.id, ...selectedCode.qrData } }}
            title={item.name}
            qrIdDisplayPreference={organization?.qrIdDisplayPreference}
            sequentialId={sequentialId}
            showShelfBranding={resolvedShowShelfBranding}
          />
        ) : selectedCode?.type === "barcode" ? (
          <BarcodeLabel
            ref={captureDivRef}
            data={selectedCode.barcodeData}
            title={item.name}
            showShelfBranding={resolvedShowShelfBranding}
          />
        ) : null}
      </div>

      {/* Actions */}
      <When truthy={!hideButton && !!selectedCode}>
        <div className="mt-8 flex w-full items-center gap-3 border-t-[1.1px] border-[#E3E4E8] px-4 py-3">
          <Button
            type="button"
            icon="download"
            onClick={downloadCode}
            download={fileName}
            ref={downloadBtnRef}
            variant="secondary"
            className="w-full"
          >
            {t("assetOverview.download")}
          </Button>
          <Button
            type="button"
            icon="print"
            variant="secondary"
            className="w-full"
            onClick={printCode}
          >
            {t("assetOverview.print")}
          </Button>
        </div>
      </When>

      {/* Add Barcode Dialog */}
      <AddBarcodeDialog
        isOpen={isAddBarcodeDialogOpen}
        onClose={() => setIsAddBarcodeDialogOpen(false)}
        item={item}
        onRefetchData={onRefetchData}
      />
    </div>
  );
};

/**
 * Authority logo printed at the foot of a downloadable label.
 *
 * Replaces the upstream "Powered by shelf.nu" line, which was stripped for this
 * deployment — leaving the workspace toggle that controls it switching nothing.
 * The toggle is a real preference again, and what it now prints is the ORG
 * mark rather than a vendor's.
 *
 * Rendered as an `<img>` from {@link config.logoPath} so it is same-origin: the
 * label is captured with `html-to-image`, and a cross-origin asset would taint
 * the canvas and fail the download. `downloadCode` already awaits
 * `waitForImagesToLoad`, so the capture waits for this image too.
 */
function LabelBranding() {
  const { logoPath } = config;

  // `logoPath` is optional in the config type. A deployment that has not set
  // one gets no strip at all rather than a broken-image icon baked into every
  // printed label.
  if (!logoPath) return null;

  return (
    <img
      src={logoPath.fullLogo}
      alt={config.appName}
      style={LABEL_BRANDING_STYLE}
    />
  );
}

// QR Label Component (existing)
export type QrDef = {
  id?: string;
  size?: SizeKeys;
  src?: string;
};

interface QrLabelProps {
  data?: { qr?: QrDef };
  title: string;
  qrIdDisplayPreference?: string;
  sequentialId?: string | null;
  showShelfBranding?: boolean;
}

export const QrLabel = React.forwardRef<HTMLDivElement, QrLabelProps>(
  function QrLabel(props, ref) {
    const {
      data,
      title,
      qrIdDisplayPreference,
      sequentialId,
      showShelfBranding = true,
    } = props ?? {};
    return (
      <div style={QR_LABEL_STYLE} ref={ref}>
        <div style={LABEL_TITLE_STYLE}>{title}</div>
        <figure className="qr-code flex justify-center">
          {/* Alt text names what the image *is* — the previous value was a
              filename carrying the vendor name, which is both meaningless to a
              screen-reader user and a branding leak. */}
          <img src={data?.qr?.src} alt={`QR code for ${title}`} />
        </figure>
        <div className="w-full text-center text-[12px]">
          <div className="font-semibold">
            {qrIdDisplayPreference === "SAM_ID" && sequentialId
              ? sequentialId
              : data?.qr?.id}
          </div>
          {showShelfBranding ? <LabelBranding /> : null}
        </div>
      </div>
    );
  },
);

// Barcode Label Component (new)
interface BarcodeLabelProps {
  data?: {
    type: BarcodeType;
    value: string;
  };
  title: string;
  showShelfBranding?: boolean;
}

export const BarcodeLabel = React.forwardRef<HTMLDivElement, BarcodeLabelProps>(
  function BarcodeLabel(props, ref) {
    const { data, title, showShelfBranding = true } = props ?? {};

    if (!data) return null;

    return (
      <div style={BARCODE_LABEL_STYLE} ref={ref}>
        <div style={LABEL_TITLE_STYLE}>{title}</div>
        <div className="flex flex-1 items-center justify-center">
          <BarcodeDisplay
            type={data.type}
            value={data.value}
            maxWidth="250px"
          />
        </div>
        <div className="w-full text-center text-[12px]">
          <div className="font-semibold">
            {data.type}:{" "}
            <div className="break-all leading-tight [overflow-wrap:break-word]">
              {data.type === "EAN13" ? (
                <Ean13LookupLink
                  value={data.value}
                  content={data.value}
                  className="text-[12px]"
                />
              ) : (
                data.value
              )}
            </div>
          </div>
          {showShelfBranding ? <LabelBranding /> : null}
        </div>
      </div>
    );
  },
);
