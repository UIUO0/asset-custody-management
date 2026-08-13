import type { MouseEvent } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  disabledBulkItemsAtom,
  removeSelectedBulkItemsAtom,
  selectedBulkItemsAtom,
  setSelectedBulkItemAtom,
  setSelectedBulkItemsAtom,
} from "~/atoms/list";
import { freezeColumnClassNames } from "~/components/assets/assets-index/freeze-column-classes";
import { FakeCheckbox } from "~/components/forms/fake-checkbox";
import { Td } from "~/components/table";
import { useAssetIndexFreezeColumn } from "~/hooks/use-asset-index-freeze-column";
import { useAssetIndexViewState } from "~/hooks/use-asset-index-view-state";
import { tw } from "~/utils/tw";
import type { ListItemData } from "../list-item";

type BulkListItemCheckboxProps = {
  item: ListItemData;
  /**
   * In booking list, we have list and kit in single table.
   * To select a kit, we need to select all items in the kit.
   */
  bulkItems?: ListItemData[];
  className?: string;
};

export default function BulkListItemCheckbox({
  item,
  bulkItems,
  className,
}: BulkListItemCheckboxProps) {
  const selectedBulkItems = useAtomValue(selectedBulkItemsAtom);
  const disabledBulkItems = useAtomValue(disabledBulkItemsAtom);
  const setSelectedBulkItem = useSetAtom(setSelectedBulkItemAtom);
  const setSelectedBulkItems = useSetAtom(setSelectedBulkItemsAtom);
  const removeSelectedBulkItems = useSetAtom(removeSelectedBulkItemsAtom);

  const freezeColumn = useAssetIndexFreezeColumn();
  const { modeIsAdvanced } = useAssetIndexViewState();

  const itemKey = item.id;
  const disabled = disabledBulkItems.some((i) => i.id === itemKey);
  const checked = !!selectedBulkItems.find((i) => i.id === itemKey);

  function handleBulkItemSelection(e: MouseEvent<HTMLTableCellElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    if (bulkItems && bulkItems.length > 0) {
      const itemsToSet = [...bulkItems, item];
      const itemsToSetKeys = new Set(itemsToSet.map((i) => i.id));
      const itemsExists = selectedBulkItems.some((selItem) =>
        itemsToSetKeys.has(selItem.id),
      );

      /** If the selected items already exists, then remove them */
      if (itemsExists) {
        removeSelectedBulkItems(itemsToSet);
      } else {
        setSelectedBulkItems(itemsToSet);
      }
    } else {
      setSelectedBulkItem(item);
    }
  }

  return (
    <Td
      className={tw(
        "md:pe-3 md:ps-4",
        modeIsAdvanced && freezeColumn ? freezeColumnClassNames.checkbox : "",
        disabled ? "cursor-not-allowed" : "",
        className,
      )}
      onClick={handleBulkItemSelection}
    >
      <div>
        <FakeCheckbox
          className={tw(
            "overflow-visible text-static-white",
            checked ? "text-primary" : "",
            disabled ? "text-gray-200" : "",
          )}
          checked={checked}
        />
      </div>
    </Td>
  );
}
