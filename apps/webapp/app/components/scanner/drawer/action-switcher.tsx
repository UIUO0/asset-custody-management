import type { ChangeEvent, KeyboardEvent } from "react";
import { useMemo, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from "@radix-ui/react-popover";
import { useAtom } from "jotai";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "~/components/icons/library";
import { Button } from "~/components/shared/button";
import When from "~/components/when/when";
import { useDisabled } from "~/hooks/use-disabled";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import { handleActivationKeyPress } from "~/utils/keyboard";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { tw } from "~/utils/tw";
import { scannerActionAtom } from "./action-atom";
import AssignCustodyDrawer from "./uses/assign-custody-drawer";
import ReleaseCustodyDrawer from "./uses/release-custody-drawer";
import UpdateLocationDrawer from "./uses/update-location-drawer";

const ACTION_CONFIGS = [
  {
    id: "View asset",
    permissionEntity: PermissionEntity.asset,
    permissionAction: PermissionAction.read,
  },
  {
    id: "Assign custody",
    permissionEntity: PermissionEntity.asset,
    permissionAction: PermissionAction.custody,
  },
  {
    id: "Release custody",
    permissionEntity: PermissionEntity.asset,
    permissionAction: PermissionAction.custody,
  },
  {
    id: "Update location",
    permissionEntity: PermissionEntity.asset,
    permissionAction: PermissionAction.update,
  },
] as const;

// Create a type from the array values
export type ActionType = (typeof ACTION_CONFIGS)[number]["id"];

/**
 * Display label per action.
 *
 * The `id` values above double as the persisted scanner-action state, so they
 * stay in English. This map is the display layer on top of them — resolved
 * with `t()` at render time.
 */
const ACTION_LABEL_KEYS: Record<ActionType, string> = {
  "View asset": "scanner.viewAsset",
  "Assign custody": "scanner.assignCustody",
  "Release custody": "scanner.releaseCustody",
  "Update location": "scanner.updateLocation",
};

export function ActionSwitcher() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useAtom(scannerActionAtom);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isLoading = useDisabled();
  const { roles } = useUserRoleHelper();

  // Filter actions based on user permissions
  const availableActions = useMemo(
    () =>
      ACTION_CONFIGS.filter(({ permissionEntity, permissionAction }) =>
        userHasPermission({
          roles,
          entity: permissionEntity,
          action: permissionAction,
        }),
      ).map((config) => config.id),
    [roles],
  );

  const filteredActions = useMemo(() => {
    if (!searchQuery) return availableActions;

    // Filter on the *translated* label so search works in the active language.
    return availableActions.filter((action) =>
      t(ACTION_LABEL_KEYS[action])
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, availableActions, t]);

  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setSelectedIndex(0); // Reset selection when search changes
  };

  // Ensure selected item is visible in viewport
  const scrollToIndex = (index: number) => {
    setTimeout(() => {
      const selectedElement = document.getElementById(`action-option-${index}`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }, 0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((prev) => {
          const newIndex = prev < filteredActions.length - 1 ? prev + 1 : prev;
          scrollToIndex(newIndex);
          return newIndex;
        });
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((prev) => {
          const newIndex = prev > 0 ? prev - 1 : prev;
          scrollToIndex(newIndex);
          return newIndex;
        });
        break;
      case "Enter":
        event.preventDefault();
        if (filteredActions[selectedIndex]) {
          changeAction(filteredActions[selectedIndex]);
        }
        break;
    }
  };

  function changeAction(newAction: ActionType) {
    setAction(newAction);
    setSelectedIndex(availableActions.indexOf(newAction));
    setOpen(false);
  }

  return (
    <div>
      {/* Drawers */}
      <When truthy={action === "Assign custody"}>
        <AssignCustodyDrawer isLoading={isLoading} />
      </When>
      <When truthy={action === "Release custody"}>
        <ReleaseCustodyDrawer isLoading={isLoading} />
      </When>
      <When truthy={action === "Update location"}>
        <UpdateLocationDrawer isLoading={isLoading} />
      </When>

      {/* Action Switcher */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className={tw(
              "py-[7px] text-[12px] font-normal ",
              open ? "bg-gray-50" : "",
            )}
          >
            <ChevronRight className="ms-[2px] inline-block rotate-90" />
            <span className="ms-2">
              {t("scanner.actionPrefix", {
                action: t(ACTION_LABEL_KEYS[action]),
              })}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            align="start"
            className={tw(
              "z-[999999] mt-2 max-h-[400px] overflow-y-scroll rounded-md border border-gray-200 bg-white",
            )}
          >
            <div className="flex items-center border-b">
              <Search className="ms-4 size-4 text-gray-500" />
              <input
                ref={searchInputRef}
                placeholder={t("scanner.searchAction")}
                className="border-0 px-4 py-2 ps-2 text-[14px] focus:border-0 focus:ring-0"
                value={searchQuery}
                onChange={handleSearch}
                onKeyDown={handleKeyDown}
              />
            </div>
            {filteredActions.map((action, index) => (
              <div
                id={`action-option-${index}`}
                key={action + index}
                className={tw(
                  "px-4 py-2 text-[14px] text-gray-600 hover:cursor-pointer hover:bg-gray-50",
                  selectedIndex === index && [
                    "bg-gray-50",
                    // Add borders only when item is selected
                    "relative",
                    // Top border - exclude for first item
                    index !== 0 &&
                      "before:absolute before:inset-x-0 before:top-0 before:border-t before:border-gray-200",
                    // Bottom border - exclude for last item
                    index !== filteredActions.length - 1 &&
                      "after:absolute after:inset-x-0 after:bottom-0 after:border-b after:border-gray-200",
                  ],
                )}
                role="option"
                aria-selected={selectedIndex === index}
                tabIndex={0}
                onClick={() => changeAction(action)}
                onKeyDown={handleActivationKeyPress(() => changeAction(action))}
              >
                <span className="font-medium">
                  {t(ACTION_LABEL_KEYS[action])}
                </span>
                <span className="ms-2 font-normal text-gray-500">
                  {t(getActionScopeKey(action))}
                </span>
              </div>
            ))}
            {filteredActions.length === 0 && (
              <div className="px-4 py-2 text-[14px] text-gray-500">
                {t("scanner.noActionsFound")}
              </div>
            )}
          </PopoverContent>
        </PopoverPortal>
      </Popover>
    </div>
  );
}

/**
 * Returns the i18n key for an action's scope ("single" vs "bulk").
 *
 * Returns a key rather than copy because this helper sits at module scope,
 * outside any component — the caller resolves it with `t()`.
 */
function getActionScopeKey(action: ActionType) {
  switch (action) {
    case "View asset":
      return "scanner.scopeSingle";
    case "Assign custody":
    case "Release custody":
    case "Update location":
      return "scanner.scopeBulk";
  }
}
