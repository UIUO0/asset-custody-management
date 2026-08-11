import { useState } from "react";
import type { CSSProperties } from "react";
import { AssetStatus } from "@prisma/client";
import { useAtomValue, useSetAtom } from "jotai";
import { CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useZorm } from "react-zorm";
import { z } from "zod";
import {
  clearScannedItemsAtom,
  removeScannedItemAtom,
  scannedItemsAtom,
  removeScannedItemsByAssetIdAtom,
  removeMultipleScannedItemsAtom,
  scannedItemIdsAtom,
} from "~/atoms/qr-scanner";
import { Form } from "~/components/custom-form";
import { CheckmarkIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/shared/modal";
import { Spinner } from "~/components/shared/spinner";
import { useDisabled } from "~/hooks/use-disabled";
import { getPrimaryCustody } from "~/modules/custody/utils";
import type { AssetFromQr } from "~/routes/api+/get-scanned-item.$qrId";
import { ShelfError } from "~/utils/error";
import { objectToFormData } from "~/utils/object-to-form-data";
import { tw } from "~/utils/tw";
import {
  assetLabelPresets,
  createAvailabilityLabels,
} from "../availability-label-factory";
import { createBlockers } from "../blockers-factory";
import ConfigurableDrawer from "../configurable-drawer";
import {
  GenericItemRow,
  DefaultLoadingState,
  TextLoader,
} from "../generic-item-row";

// Export the schema so it can be reused
export const ReleaseCustodyFromScannedItemsSchema = z.object({
  assetIds: z.array(z.string()).min(1),
});

const BulkReleaseCustodySchema = z.object({
  assetIds: z.array(z.string()).min(1, "At least one asset must be selected"),
});

type CustodyState = {
  assetStatus: "processing" | "success" | "error" | "skipped";
  assetErrorMessage?: string;
};

/**
 * Drawer component for managing scanned items to release from custody
 */
export default function ReleaseCustodyDrawer({
  className,
  style,
  isLoading,
  defaultExpanded = false,
}: {
  className?: string;
  style?: CSSProperties;
  isLoading?: boolean;
  defaultExpanded?: boolean;
}) {
  const { t } = useTranslation();
  // Get the scanned items from jotai
  const items = useAtomValue(scannedItemsAtom);
  const clearList = useSetAtom(clearScannedItemsAtom);
  const removeItem = useSetAtom(removeScannedItemAtom);
  const removeAssetsFromList = useSetAtom(removeScannedItemsByAssetIdAtom);
  const removeItemsFromList = useSetAtom(removeMultipleScannedItemsAtom);

  // Filter and prepare data
  const assets = Object.values(items)
    .filter((item) => !!item && item.data && item.type === "asset")
    .map((item) => item?.data as AssetFromQr);

  // Setup blockers
  const errors = Object.entries(items).filter(([, item]) => !!item?.error);

  // Asset blockers - here we look for assets NOT in custody (AVAILABLE OF CHECKED_OUT)
  const assetsNotInCustody = assets
    .filter((asset) => !!asset && asset.status !== AssetStatus.IN_CUSTODY)
    .map((asset) => asset.id);

  // Create blockers configuration
  const blockerConfigs = [
    {
      condition: assetsNotInCustody.length > 0,
      count: assetsNotInCustody.length,
      message: (count: number) => (
        <>
          <strong>{`${count} asset${count > 1 ? "s are" : " is"}`}</strong>{" "}
          {t("scanner.blockerNotInCustody")}
        </>
      ),
      description: t("scanner.blockerOnlyInCustodyReleased"),
      onResolve: () => removeAssetsFromList(assetsNotInCustody),
    },
    {
      condition: errors.length > 0,
      count: errors.length,
      message: (count: number) => (
        <>
          <strong>{`${count} QR codes `}</strong> {t("scanner.blockerInvalid")}
        </>
      ),
      onResolve: () => removeItemsFromList(errors.map(([qrId]) => qrId)),
    },
  ];

  // Create blockers component
  const [hasBlockers, Blockers] = createBlockers({
    blockerConfigs,
    onResolveAll: () => {
      removeAssetsFromList(assetsNotInCustody);
      removeItemsFromList(errors.map(([qrId]) => qrId));
    },
  });

  // Render item row
  const renderItemRow = (qrId: string, item: any) => (
    <GenericItemRow
      key={qrId}
      qrId={qrId}
      item={item}
      onRemove={removeItem}
      renderLoading={(qrId, error) => (
        <DefaultLoadingState qrId={qrId} error={error} />
      )}
      renderItem={(data) => {
        if (item?.type === "asset") {
          return <AssetRow asset={data as AssetFromQr} />;
        }
        return null;
      }}
    />
  );

  return (
    <ConfigurableDrawer
      schema={ReleaseCustodyFromScannedItemsSchema}
      items={items}
      onClearItems={clearList}
      title={t("scanner.itemsScanned")}
      isLoading={isLoading}
      renderItem={renderItemRow}
      Blockers={Blockers}
      defaultExpanded={defaultExpanded}
      className={className}
      style={style}
      form={<ReleaseCustodyForm disableSubmit={hasBlockers} />}
    />
  );
}

function ReleaseCustodyForm({ disableSubmit }: { disableSubmit: boolean }) {
  const { t } = useTranslation();
  const { assetIds, idsTotalCount } = useAtomValue(scannedItemIdsAtom);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [custodyState, setCustodyState] = useState<CustodyState>({
    assetStatus: "processing",
  });

  const disabled = useDisabled();

  const zo = useZorm("BulkReleaseCustody", BulkReleaseCustodySchema, {
    onValidSubmit: (e) => {
      e.preventDefault();
      setDialogOpen(true);
      const { assetIds } = e.data;

      // Handle asset request
      if (assetIds && assetIds.length > 0) {
        // Create object data structure for assets
        const assetData = {
          assetIds,
        };

        // Convert to FormData
        const assetFormData = objectToFormData(assetData);

        // Send asset request
        fetch("/api/assets/bulk-release-custody", {
          method: "POST",
          body: assetFormData,
        })
          .then((response) => response.json())
          .then((data) => {
            setCustodyState((state) => ({
              ...state,
              assetStatus: data.error ? "error" : "success",
              ...(data.error && { assetErrorMessage: data.error.message }),
            }));
          })
          .catch((error) => {
            setCustodyState((state) => ({
              ...state,
              assetStatus: "error",
              assetErrorMessage:
                error instanceof ShelfError
                  ? error.message
                  : t("scanner.releaseCustodyFailed"),
            }));
          });
      } else {
        // No assets to process, mark as skipped
        setCustodyState((state) => ({
          ...state,
          assetStatus: "skipped",
        }));
      }
    },
  });

  const clearItems = useSetAtom(clearScannedItemsAtom);

  function cleanupState() {
    setCustodyState({
      assetStatus: "processing",
    });
    clearItems();
  }

  return (
    <>
      <SubmittingDialog
        open={dialogOpen}
        setOpen={setDialogOpen}
        custodyState={custodyState}
        cleanupState={cleanupState}
      />
      <Form ref={zo.ref}>
        {assetIds.map((id, index) => (
          <input
            key={`asset-${id}`}
            type="hidden"
            name={`assetIds[${index}]`}
            value={id}
          />
        ))}

        <div className="px-4 md:ps-0">
          <div className={tw("mb-4 flex gap-3")}>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled || disableSubmit || idsTotalCount === 0}
            >
              {t("assetActions.releaseCustody")}
            </Button>
          </div>
        </div>
      </Form>
    </>
  );
}

// Implement item renderers if they're not already defined elsewhere
export function AssetRow({ asset }: { asset: AssetFromQr }) {
  const { t } = useTranslation();
  // Use predefined presets to create label configurations with appropriate conditions for release custody
  const availabilityConfigs = [
    {
      condition: asset.status === AssetStatus.IN_CUSTODY,
      badgeText: t("scanAvailability.inCustodyOf", {
        name: getPrimaryCustody(asset.custody)?.custodian?.name,
      }),
      tooltipTitle: t("scanAvailability.assetInCustodyTitle"),
      tooltipContent: t("scanAvailability.assetInCustodyOfContent", {
        name: getPrimaryCustody(asset.custody)?.custodian?.name,
      }),
      priority: 110,
      className: "bg-gray-50 border-gray-200 text-gray-700",
    },
    // For release custody, we highlight assets that are NOT in custody (opposite of assign custody)
    {
      condition: asset.status !== AssetStatus.IN_CUSTODY,
      badgeText: t("scanAvailability.notInCustody"),
      tooltipTitle: t("scanAvailability.assetNotInCustodyTitle"),
      tooltipContent: t("scanAvailability.assetNotInCustodyContent"),
      priority: 100,
    },
    assetLabelPresets.checkedOut(t, asset.status === AssetStatus.CHECKED_OUT),
  ];

  // Create the availability labels component with max 3 labels
  const [, AssetAvailabilityLabels] = createAvailabilityLabels(
    availabilityConfigs,
    {
      maxLabels: 3,
    },
  );

  return (
    <div className="flex flex-col gap-1">
      <p className="word-break whitespace-break-spaces font-medium">
        {asset.title}
      </p>

      <div className="flex flex-wrap items-center gap-1">
        <span
          className={tw(
            "inline-block bg-gray-50 px-[6px] py-[2px]",
            "rounded-md border border-gray-200",
            "text-xs text-gray-700",
          )}
        >
          asset
        </span>
        <AssetAvailabilityLabels />
      </div>
    </div>
  );
}
function SubmittingDialog({
  open,
  setOpen,
  custodyState,
  cleanupState,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  custodyState: CustodyState;
  cleanupState: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) cleanupState();
        setOpen(newOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("scanner.releasingCustody")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-4">
              <SubmissionState
                type={"asset"}
                status={custodyState.assetStatus}
                errorMessage={custodyState?.assetErrorMessage}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <div className="flex justify-center gap-2">
            <AlertDialogCancel asChild>
              <Button type="button" variant="secondary">
                Done
              </Button>
            </AlertDialogCancel>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SubmissionState({
  type,
  status,
  errorMessage,
}: {
  type: "asset";
  status: "processing" | "success" | "error" | "skipped";
  errorMessage?: string;
}) {
  const { t } = useTranslation();
  // Return null for skipped status to hide the component entirely
  if (status === "skipped") {
    return null;
  }

  if (status === "processing") {
    return (
      <div className="flex flex-row gap-2">
        <Spinner />
        <TextLoader text={`Releasing custody from ${type}s`} />
      </div>
    );
  } else if (status === "success") {
    return (
      <div className="flex flex-row items-center gap-2 text-start">
        <span className="text-green-700">
          <CheckmarkIcon />
        </span>
        <div className="font-mono">Assets have been released from custody</div>
      </div>
    );
  } else if (status === "error") {
    return (
      <div>
        <div className="flex flex-row items-center gap-2 text-start">
          <CircleX className="size-[18px] text-error-500" />
          <div className="font-mono">
            Failed to release custody from {type}s.
          </div>
        </div>
        {errorMessage && (
          <span className="text-[12px] text-error-500">
            <strong>{t("scanner.errorPrefix")}</strong> {errorMessage}
          </span>
        )}
      </div>
    );
  }
}
