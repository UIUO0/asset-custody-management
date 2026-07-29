import { useTranslation } from "react-i18next";
import type { PriceWithProduct } from "./prices";
import { Prices } from "./prices";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../shared/tabs";

export function PricingTable({
  prices,
}: {
  prices: {
    [key: string]: PriceWithProduct[];
  };
}) {
  const { t } = useTranslation();
  return (
    <Tabs defaultValue={"year"} className="flex w-full flex-col">
      <TabsList className="center mx-auto mb-8">
        <TabsTrigger value="year">
          Yearly{" "}
          <span className="ms-2 rounded-[16px] bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700">
            {t("subscription.save54")}
          </span>
        </TabsTrigger>
        <TabsTrigger value="month">{t("audits.monthly")}</TabsTrigger>
      </TabsList>
      <TabsContent value="year">
        <Prices prices={prices["year"]} />
      </TabsContent>
      <TabsContent value="month">
        <Prices prices={prices["month"]} />
      </TabsContent>
    </Tabs>
  );
}
