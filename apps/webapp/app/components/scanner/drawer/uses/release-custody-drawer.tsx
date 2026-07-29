import { useState } from "react";
import type { CSSProperties } from "react";
import { AssetStatus, AssetType } from "@prisma/client";
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
import { isQuantityTracked } from "~/modules/asset/utils";
import { getPrimaryCustody } from "~/modules/custody/utils";
import type {
  AssetFromQr,
  KitFromQr,
} from "~/routes/api+/get-scanned-item.$qrId";
import { ShelfError } from "~/utils/error";
import { objectToFormData } from "~/utils/object-to-form-data";
import { tw } from "~/utils/tw";
import {
  assetLabelPresets,
  createAvailabilityLabels,
  kitLabelPresets,
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

const BulkReleaseCustodySchema = z
  .object({
    assetIds: z.array(z.string()).optional().default([]),
    kitIds: z.array(z.string()).optional().default([]),
  })
  .refine((data) => data.assetIds.length > 0 || data.kitIds.length > 0, {
    message: "At least one asset or kit must be selected",
    path: ["assetIds"], // This will attach the error to the assetIds field
  });

type CustodyState = {
  assetStatus: "processing" | "success" | "error" | "skipped";
  assetErrorMessage?: string;
  kitStatus: "processing" | "success" | "error" | "skipped";
  kitErrorMessage?: string;
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

  const kits = Object.values(items)
    .filter((item) => !!item && item.data && item.type === "kit")
    .map((item) => item?.data as KitFromQr);

  // Setup blockers
  const errors = Object.entries(items).filter(([, item]) => !!item?.error);

  // Asset blockers - here we look for assets NOT in custody (AVAILABLE OF CHECKED_OUT)
  const assetsNotInCustody = assets
    .filter((asset) => !!asset && asset.status !== AssetStatus.IN_CUSTODY)
    .map((asset) => asset.id);

  // Asset is part of a kit. Only block INDIVIDUAL assets — qty-tracked
  // assets can have a partial-custody slice independent of any kit
  // allocation, so a kit membership shouldn't prevent releasing
  // operator-only custody.
  const assetsArePartOfKit = assets
    .filter(
      (asset) =>
        !!asset &&
        asset.type === AssetType.INDIVIDUAL &&
        asset.assetKits.length > 0 &&
        asset.id,
    )
    .map((asset) => asset.id);

  // Kit blockers
  // Kit is not in custody (AVAILABLE OF CHECKED_OUT)
  const kitsNotInCustody = kits
    .filter((kit) => kit.status !== AssetStatus.IN_CUSTODY)
    .map((kit) => kit.id);

  // Find the QR IDs that correspond to kit IDs with blockers
  // This is necessary because we need to remove the QR IDs from the items object, not the kit IDs
  const getQrIdsForKitIds = (kitIds: string[]) =>
    Object.entries(items)
      .filter(([, item]) => {
        if (!item || item.type !== "kit") return false;
        return kitIds.includes((item.data as KitFromQr)?.id);
      })
      .map(([qrId]) => qrId);

  // Get the QR IDs for each type of kit blocker
  const qrIdsOfKitsNotInCustody = getQrIdsForKitIds(kitsNotInCustody);

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
      condition: assetsArePartOfKit.length > 0,
      count: assetsArePartOfKit.length,
      message: (count: number) => (
        <>
          <strong>{`${count} asset${count > 1 ? "s" : ""} `}</strong>{" "}
          {t("scanner.blockerPartOfKit")}
        </>
      ),
      description: t("scanner.noteScanKitQrToRelease"),
      onResolve: () => removeAssetsFromList(assetsArePartOfKit),
    },
    {
      condition: qrIdsOfKitsNotInCustody.length > 0,
      count: qrIdsOfKitsNotInCustody.length,
      message: (count: number) => (
        <>
          <strong>{`${count} kit${count > 1 ? "s are" : " is"} `}</strong>{" "}
          {t("scanner.blockerNotInCustody")}
        </>
      ),
      description: t("scanner.blockerOnlyKitsInCustody"),
      onResolve: () => removeItemsFromList(qrIdsOfKitsNotInCustody),
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
      removeAssetsFromList([...assetsNotInCustody, ...assetsArePartOfKit]);
      removeItemsFromList([
        ...errors.map(([qrId]) => qrId),
        ...qrIdsOfKitsNotInCustody,
      ]);
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
        } else if (item?.type === "kit") {
          return <KitRow kit={data as KitFromQr} />;
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
  const { assetIds, kitIds, idsTotalCount } = useAtomValue(scannedItemIdsAtom);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [custodyState, setCustodyState] = useState<CustodyState>({
    assetStatus: "processing",
    kitStatus: "processing",
  });

  const disabled = useDisabled();

  const zo = useZorm("BulkReleaseCustody", BulkReleaseCustodySchema, {
    onValidSubmit: (e) => {
      e.preventDefault();
      setDialogOpen(true);
      const { assetIds, kitIds } = e.data;

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

      // Handle kit request
      if (kitIds && kitIds.length > 0) {
        // Create object data structure for kits
        const kitData = {
          kitIds,
          intent: "bulk-release-custody",
        };

        // Convert to FormData
        const kitFormData = objectToFormData(kitData);

        // Send kit request
        fetch("/api/kits/bulk-actions", {
          method: "POST",
          body: kitFormData,
        })
          .then((response) => response.json())
          .then((data) => {
            setCustodyState((state) => ({
              ...state,
              kitStatus: data.error ? "error" : "success",
              ...(data.error && { kitErrorMessage: data.error.message }),
            }));
          })
          .catch((error) => {
            setCustodyState((state) => ({
              ...state,
              kitStatus: "error",
              kitErrorMessage:
                error instanceof ShelfError
                  ? error.message
                  : t("scanner.releaseCustodyFailed"),
            }));
          });
      } else {
        // No kits to process, mark as skipped
        setCustodyState((state) => ({
          ...state,
          kitStatus: "skipped",
        }));
      }
    },
  });

  const clearItems = useSetAtom(clearScannedItemsAtom);

  function cleanupState() {
    setCustodyState({
      assetStatus: "processing",
      kitStatus: "processing",
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

        {kitIds.map((id, index) => (
          <input
            key={`kit-${id}`}
            type="hidden"
            name={`kitIds[${index}]`}
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
    assetLabelPresets.partOfKit(
      t,
      asset.assetKits.length > 0,
      isQuantityTracked(asset),
    ),
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

export function KitRow({ kit }: { kit: KitFromQr }) {
  const { t } = useTranslation();
  // Use predefined presets to create label configurations appropriate for release custody
  const availabilityConfigs = [
    {
      condition: kit.status === AssetStatus.IN_CUSTODY,
      badgeText: t("scanAvailability.inCustodyOf", {
        name: kit.custody?.custodian?.name,
      }),
      tooltipTitle: t("scanAvailability.kitInCustodyTitle"),
      tooltipContent: t("scanAvailability.kitInCustodyOfContent", {
        name: kit.custody?.custodian?.name,
      }),
      priority: 110,
      className: "bg-gray-50 border-gray-200 text-gray-700",
    },
    // For release custody, we highlight kits that are NOT in custody (opposite of assign custody)
    {
      condition: kit.status !== AssetStatus.IN_CUSTODY,
      badgeText: t("scanAvailability.notInCustody"),
      tooltipTitle: t("scanAvailability.kitNotInCustodyTitle"),
      tooltipContent: t("scanAvailability.kitNotInCustodyContent"),
      priority: 100,
    },
    kitLabelPresets.checkedOut(t, kit.status === AssetStatus.CHECKED_OUT),
  ];

  // Create the availability labels component with default options
  const [, KitAvailabilityLabels] = createAvailabilityLabels(
    availabilityConfigs,
    {
      maxLabels: 3,
    },
  );

  return (
    <div className="flex flex-col gap-1">
      <p className="word-break whitespace-break-spaces font-medium">
        {kit.name}{" "}
        <span className="text-[12px] font-normal text-gray-700">
          ({kit._count.assetKits} assets)
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={tw(
            "inline-block bg-gray-50 px-[6px] py-[2px]",
            "rounded-md border border-gray-200",
            "text-xs text-gray-700",
          )}
        >
          kit
        </span>
        <KitAvailabilityLabels />
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
              <SubmissionState
                type={"kit"}
                status={custodyState.kitStatus}
                errorMessage={custodyState?.kitErrorMessage}
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
  type: "asset" | "kit";
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
        <div className="font-mono">
          {type === "asset" ? "Assets" : t("nav.kits")} have been released from
          custody
        </div>
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
