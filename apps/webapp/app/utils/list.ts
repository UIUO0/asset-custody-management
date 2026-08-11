import type {
  SortingDirection,
  SortingOptions,
} from "~/components/list/filters/sort-by";
import type { ListItemData } from "~/components/list/list-item";

export const getParamsValues = (searchParams: URLSearchParams) => ({
  page: Number(searchParams.get("page") || "1"),
  perPageParam: Number(searchParams.get("per_page") || 0),
  orderBy: (searchParams.get("orderBy") || "createdAt") as SortingOptions,
  orderDirection: (searchParams.get("orderDirection") ||
    "desc") as SortingDirection,
  search: searchParams.get("s") || null,
  categoriesIds: searchParams.getAll("category") || [],
  tagsIds: searchParams.getAll("tag") || [],
  batch:
    searchParams.get("batch") === "ALL" // If the value is "ALL", we just remove the param
      ? null
      : (searchParams.get("batch") as string | null),
  locationIds: searchParams.getAll("location"),
  teamMemberIds: searchParams.getAll("teamMember") || [],
  tab: searchParams.get("tab") as "assets" | "kits",
  id: searchParams.getAll("id") || [],
  assetKitFilter: searchParams.get("assetKitFilter"),
  tags: searchParams.getAll("tag") || [],
});

export const ALL_SELECTED_KEY = "all-selected";

export function isSelectingAllItems(selectedItems: ListItemData[]) {
  return !!selectedItems.find((item) => item.id === ALL_SELECTED_KEY);
}
