import { useTranslation } from "react-i18next";
import { Button } from "../shared/button";

export const CategorySelectNoCategories = () => {
  const { t } = useTranslation();

  return (
    <div>
      {t("categories.noneYet")}{" "}
      <Button to={"/categories/new"} variant="link" className="">
        {t("categories.emptyCta")}
      </Button>
    </div>
  );
};
