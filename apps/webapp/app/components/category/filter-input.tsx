import type React from "react";
import { useTranslation } from "react-i18next";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import Input from "../forms/input";

export const FilterInput = ({
  filter,
  handleFilter,
}: {
  filter: string;
  handleFilter: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => {
  const { t } = useTranslation();
  const inputRef = useAutoFocus<HTMLInputElement>();

  return (
    <Input
      type="text"
      label={t("list.searchCategories")}
      placeholder={t("list.searchCategories")}
      hideLabel
      className="mb-2 text-gray-500"
      icon="coins"
      value={filter}
      onChange={handleFilter}
      ref={inputRef}
    />
  );
};
