import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import type { BookLink } from "~/components/shared/generic-add-to-bookings-actions-dropdown";
import { GenericBookActionsDropdown } from "~/components/shared/generic-add-to-bookings-actions-dropdown";
import { useCurrentOrganization } from "~/hooks/use-current-organization";
import type { loader } from "~/routes/_layout+/kits.$kitId";
import { isPersonalOrg } from "~/utils/organization";

export default function BookingActionsDropdown() {
  const { t } = useTranslation();
  const { kit } = useLoaderData<typeof loader>();
  const organization = useCurrentOrganization();

  if (isPersonalOrg(organization)) return null;

  const noAssets = kit.assetKits.length === 0;
  const someAssetIsNotAvailable = kit.assetKits.some(
    (ak) => !ak.asset.availableToBook,
  );

  const disabled = noAssets
    ? {
        reason: t("kits.noAssetsForBooking"),
      }
    : false;

  const disabledTrigger = someAssetIsNotAvailable
    ? {
        reason: t("kits.someAssetsUnavailable"),
      }
    : false;

  const links = [
    {
      indexType: "kit",
      id: kit.id,
      disabled,
      label: t("bookings.createNewBooking"),
      icon: "bookings",
      to: "assets/create-new-booking",
    },
    {
      indexType: "kit",
      id: kit.id,
      label: t("assetActions.addToExistingBooking"),
      icon: "booking-exist",
      disabled,
      to: `/kits/${kit.id}/assets/add-to-existing-booking`,
    },
  ] as BookLink[];

  return (
    <div className="actions-dropdown flex">
      <GenericBookActionsDropdown
        links={links}
        key={"kit"}
        label={t("assetOverview.book")}
        disabledTrigger={disabledTrigger}
      />
    </div>
  );
}
