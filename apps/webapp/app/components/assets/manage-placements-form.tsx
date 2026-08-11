/**
 * Manage Placements Form
 *
 * Multi-row editor used by the asset-overview "Manage placements"
 * dialog (Phase 4b-Polish-3 Fix 2). Lets the user spread a
 * QUANTITY_TRACKED asset across multiple locations at distinct
 * per-location quantities, or remove placements entirely.
 *
 * UX shape:
 *  - One row per placement: location dropdown + qty input + remove
 *    button.
 *  - "Add another location" button appends a row when there's room.
 *  - Live "placed / unplaced" indicator using `Asset.quantity` as the
 *    bound (mirrors the rule enforced server-side in
 *    `replaceAssetPlacements`).
 *  - Hidden JSON field `placements` carries the full set on submit.
 *
 * INDIVIDUAL assets get the same UI but capped at one row by the
 * "Add another location" disabled state — the server-side validator
 * is the ultimate guard against tampering.
 *
 * @see {@link file://./../../routes/_layout+/assets.$assetId.overview.manage-placements.tsx}
 * @see {@link file://./../../modules/asset/service.server.ts} — `replaceAssetPlacements`
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "~/components/custom-form";
import { Button } from "~/components/shared/button";
import { useDisabled } from "~/hooks/use-disabled";

type LocationOption = {
  id: string;
  name: string;
};

type PlacementRow = {
  /** Stable client-side row id so unmount/reorder doesn't lose focus. */
  rowId: string;
  /** Selected location id; empty string means "not picked yet". */
  locationId: string;
  /** Qty for QUANTITY_TRACKED rows; INDIVIDUAL ignores this server-side. */
  quantity: number;
};

export interface ManagePlacementsFormProps {
  /** True for QUANTITY_TRACKED assets — gates the qty input + sum line. */
  isQty: boolean;
  /** `Asset.quantity` — the upper bound on `sum(quantity)`. Null for INDIVIDUAL. */
  assetQuantity: number | null;
  /** Unit-of-measure suffix. Null falls back to "units". */
  unitOfMeasure: string | null;
  /** Workspace locations available to pick. */
  locations: LocationOption[];
  /** Pre-existing placements; pre-fills the editable rows. */
  initialPlacements: Array<{
    locationId: string;
    locationName: string;
    quantity: number;
  }>;
  /** Server-side error message surfaced as a red banner. */
  serverErrorMessage: string | null;
}

let rowCounter = 0;
function nextRowId() {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

/**
 * Renders the multi-row placement editor. Owns row state + validation
 * messages; submits as a single hidden JSON field to the route action.
 */
export function ManagePlacementsForm({
  isQty,
  assetQuantity,
  unitOfMeasure,
  locations,
  initialPlacements,
  serverErrorMessage,
}: ManagePlacementsFormProps) {
  const { t } = useTranslation();
  const disabled = useDisabled();
  const unit = unitOfMeasure || "units";
  const totalPool = assetQuantity ?? 1;

  const [rows, setRows] = useState<PlacementRow[]>(() =>
    initialPlacements.length > 0
      ? initialPlacements.map((p) => ({
          rowId: nextRowId(),
          locationId: p.locationId,
          quantity: p.quantity,
        }))
      : [
          {
            rowId: nextRowId(),
            locationId: "",
            quantity: isQty ? totalPool : 1,
          },
        ],
  );

  /** Sum of currently-entered placements — drives the placed/unplaced indicator. */
  const placedSum = useMemo(
    () => rows.reduce((s, r) => (r.locationId ? s + (r.quantity || 0) : s), 0),
    [rows],
  );

  /** Locations not yet picked, so each dropdown only offers fresh options. */
  const availableLocations = useMemo(
    () => (locationId: string) =>
      locations.filter(
        (loc) =>
          loc.id === locationId || !rows.some((r) => r.locationId === loc.id),
      ),
    [locations, rows],
  );

  /**
   * Client-side validation messages — server is the ultimate guard.
   */
  const clientError = useMemo(() => {
    if (!isQty) return null;
    if (placedSum > totalPool) {
      return `Sum of placements (${placedSum}) exceeds the asset's total quantity (${totalPool}).`;
    }
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.locationId) continue;
      if (seen.has(r.locationId)) {
        return "Each location can appear at most once. Remove the duplicate row.";
      }
      seen.add(r.locationId);
    }
    return null;
  }, [isQty, placedSum, totalPool, rows]);

  const unplaced = Math.max(0, totalPool - placedSum);

  const canAddRow = isQty
    ? rows.length < locations.length && unplaced > 0
    : rows.length === 0;

  const addRow = () => {
    const defaultQty = isQty ? Math.max(1, unplaced) : 1;
    setRows((prev) => [
      ...prev,
      { rowId: nextRowId(), locationId: "", quantity: defaultQty },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const updateLocation = (rowId: string, locationId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, locationId } : r)),
    );
  };

  const updateQuantity = (rowId: string, raw: number) => {
    if (!Number.isFinite(raw)) return;
    const capped = Math.max(1, Math.min(Math.floor(raw), totalPool));
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, quantity: capped } : r)),
    );
  };

  /** Build the JSON payload submitted to the action — drops empty rows. */
  const placementsPayload = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => r.locationId)
          .map((r) => ({
            locationId: r.locationId,
            quantity: isQty ? r.quantity : 1,
          })),
      ),
    [rows, isQty],
  );

  return (
    <Form method="post">
      {/* Placement rows */}
      <div className="mb-4 space-y-3">
        {rows.map((row, idx) => (
          <div
            key={row.rowId}
            className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2"
          >
            <select
              value={row.locationId}
              onChange={(e) => updateLocation(row.rowId, e.target.value)}
              disabled={disabled}
              className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 px-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              aria-label={`Location for placement ${idx + 1}`}
            >
              <option value="">— Select a location —</option>
              {availableLocations(row.locationId).map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            {isQty ? (
              <div className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={totalPool}
                  value={row.quantity}
                  onChange={(e) =>
                    updateQuantity(row.rowId, Number(e.target.value))
                  }
                  disabled={disabled}
                  className="h-9 w-20 rounded-md border border-gray-300 px-2 text-center text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  aria-label={`Quantity for placement ${idx + 1}`}
                />
                <span className="text-xs text-gray-400">{unit}</span>
              </div>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              onClick={() => removeRow(row.rowId)}
              disabled={disabled}
              aria-label={`Remove placement ${idx + 1}`}
            >
              ×
            </Button>
          </div>
        ))}

        {/* Add-row button */}
        <Button
          type="button"
          variant="secondary"
          width="full"
          disabled={disabled || !canAddRow}
          onClick={addRow}
        >
          + Add{rows.length > 0 ? " another" : ""} location
        </Button>
      </div>

      {/* Placed / unplaced indicator (qty-tracked only). Splits the
          allocation into the rows the form edits and the unplaced
          remainder. Total always equals `Asset.quantity`. */}
      {isQty ? (
        <div className="mb-4 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>{t("assets.placedManual")}</span>
            <span className="tabular-nums">
              {placedSum} / {totalPool} {unit}
            </span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>{t("quantity.unplaced")}</span>
            <span className="tabular-nums">
              {unplaced} {unit}
            </span>
          </div>
        </div>
      ) : null}

      {clientError ? (
        <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-800">
          {clientError}
        </div>
      ) : null}

      {serverErrorMessage ? (
        <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-800">
          {serverErrorMessage}
        </div>
      ) : null}

      <input type="hidden" name="placements" value={placementsPayload} />

      <div className="flex gap-3">
        <Button to=".." variant="secondary" width="full" disabled={disabled}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          variant="primary"
          width="full"
          disabled={disabled || !!clientError}
        >
          {t("ui.savePlacements")}
        </Button>
      </div>
    </Form>
  );
}
