import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import type { loader } from "~/routes/_layout+/home";

function KpiCard({
  label,
  value,
  to,
}: {
  label: string;
  value: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-1 flex-col rounded border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50 md:p-6"
    >
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <span className="mt-1 text-2xl font-semibold text-gray-900">{value}</span>
    </Link>
  );
}

export default function KpiCards() {
  const { t } = useTranslation();
  const { totalAssets, teamMembersCount, locationsCount, categoriesCount } =
    useLoaderData<typeof loader>();

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <KpiCard
        label={t("bookings.totalAssets")}
        value={totalAssets.toLocaleString()}
        to="/assets"
      />
      <KpiCard
        label={t("nav.categories")}
        value={categoriesCount.toLocaleString()}
        to="/categories"
      />
      <KpiCard
        label={t("nav.locations")}
        value={locationsCount.toLocaleString()}
        to="/locations"
      />
      <KpiCard
        label={t("bookingForm.teamMembers")}
        value={teamMembersCount.toLocaleString()}
        to="/settings/team"
      />
    </div>
  );
}
