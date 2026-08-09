import { AreaChart } from "@tremor/react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { ClientOnly } from "remix-utils/client-only";
import type { loader } from "~/routes/_layout+/home";
import { DashboardEmptyState } from "../dashboard/empty-state";
import FallbackLoading from "../dashboard/fallback-loading";
import { Button } from "../shared/button";

export default function AssetGrowthChart() {
  const { t } = useTranslation();
  const { assetGrowthData, totalAssets } = useLoaderData<typeof loader>();

  /**
   * Tremor derives the series name from the data key, so the localised label
   * has to be the key itself — hence the computed property below. The loader's
   * field stays `totalAssets`; only the presentation key is translated.
   */
  const totalAssetsLabel = t("bookings.totalAssets");

  // Build short month labels: "Mar '25"
  const chartData = assetGrowthData.map((d: any) => ({
    date: `${d.month.slice(0, 3)} '${String(d.year).slice(2)}`,
    [totalAssetsLabel]: d["Total assets"],
  }));

  return (
    <div className="flex h-full flex-col rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-gray-900">
            {t("ui.assetGrowth")}
          </span>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
            12 months
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            to="/assets"
            variant="block-link-gray"
            className="!mt-0 text-xs"
          >
            {t("audits.viewAll")}
          </Button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        {totalAssets > 0 ? (
          <ClientOnly
            fallback={<FallbackLoading className="h-[180px] w-full" />}
          >
            {() => (
              <AreaChart
                className="h-[180px] w-full"
                data={chartData}
                index="date"
                categories={[totalAssetsLabel]}
                colors={["orange"]}
                showAnimation={true}
                animationDuration={600}
                curveType="monotone"
                showLegend={false}
                showGridLines={false}
                yAxisWidth={40}
                autoMinValue={true}
              />
            )}
          </ClientOnly>
        ) : (
          <DashboardEmptyState
            text={t("assets.empty")}
            subText={t("home.assetGrowthEmpty")}
            ctaTo="/receipts/new"
            ctaText={t("assets.createAsset")}
          />
        )}
      </div>
    </div>
  );
}
