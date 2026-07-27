import type { BookingStatus, Tag as PrismaTag, User } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { BookingLifecycleProgress as BookingLifecycleProgressType } from "~/modules/booking/utils.server";
import { resolveUserDisplayName } from "~/utils/user";
import { BookingLifecycleProgress as BookingLifecycleProgressBar } from "./booking-lifecycle-progress";
import { CategoryBadge } from "../assets/category-badge";
import ItemsWithViewMore from "../list/items-with-view-more";
import { DateS } from "../shared/date";
import { InfoTooltip } from "../shared/info-tooltip";
import { Separator } from "../shared/separator";
import { Tag as TagBadge } from "../shared/tag";
import { UserBadge } from "../shared/user-badge";

export function BookingStatistics({
  duration,
  totalAssets,
  kitsCount,
  assetsCount,
  totalValue,
  allCategories,
  tags,
  creator,
  lifecycleProgress,
  autoArchivedAt,
  status,
}: {
  duration: string;
  totalAssets: number;
  kitsCount: number;
  assetsCount: number;
  totalValue: string;
  allCategories: { id: string; name: string; color: string }[];
  tags: Pick<PrismaTag, "id" | "name" | "color">[];
  creator: Pick<User, "id" | "firstName" | "lastName" | "profilePicture">;
  /**
   * Segmented checkout/check-in lifecycle progress. When present (and the
   * booking has any partial checkout/check-in activity), renders the
   * {@link BookingLifecycleProgressBar} segmented bar.
   */
  lifecycleProgress?: BookingLifecycleProgressType;
  autoArchivedAt?: Date | null;
  status: BookingStatus;
}) {
  const { t } = useTranslation();

  return (
    <div className="m-0">
      <h3>{t("bookings.statisticsTitle")}</h3>
      <div className="mt-4 flex flex-col gap-4">
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {t("bookings.bookingDuration")}
          </span>
          <span className="text-end font-medium">{duration}</span>
        </div>

        {/* Check-out/check-in progress sits directly under Booking duration so
            the three composition counts (Assets / Kits / Total assets) stay
            grouped together below it. Conditionally rendered — only once the
            booking has partial checkout/check-in activity. */}
        {lifecycleProgress &&
          lifecycleProgress.totalUnits > 0 &&
          (lifecycleProgress.hasPartialCheckouts ||
            lifecycleProgress.hasPartialCheckins) && (
            <>
              <Separator />
              <BookingLifecycleProgressBar progress={lifecycleProgress} />
            </>
          )}
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{t("assets.title")}</span>
          <span className="text-end font-medium">{assetsCount}</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{t("nav.kits")}</span>
          <span className="text-end font-medium">{kitsCount}</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-sm text-gray-500">
            {t("bookings.totalAssets")}{" "}
            <InfoTooltip
              iconClassName="size-4"
              content={<p>{t("bookings.totalAssetsTooltip")}</p>}
            />
          </span>
          <span className="text-end font-medium">{totalAssets}</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {t("bookings.totalValue")}
          </span>
          <span className="text-end font-medium">{totalValue}</span>
        </div>
        <Separator />
        <div className="flex items-start justify-between">
          <span className="text-sm text-gray-500">{t("nav.categories")}</span>
          <div className="text-end">
            <ItemsWithViewMore
              items={allCategories}
              emptyMessage={t("bookings.noCategories")}
              renderItem={(category) => (
                <CategoryBadge category={category} key={category.id} />
              )}
            />
          </div>
        </div>
        <Separator />
        <div className="flex items-start justify-between">
          <span className="text-sm text-gray-500">{t("nav.tags")}</span>
          <div className="text-end">
            <ItemsWithViewMore
              items={tags}
              emptyMessage={t("bookings.noTags")}
              renderItem={(tag) => (
                <TagBadge
                  key={tag.id}
                  color={tag.color ?? undefined}
                  withDot={false}
                >
                  {tag.name}
                </TagBadge>
              )}
            />
          </div>
        </div>
        <Separator />

        <div className="flex items-start justify-between">
          <span className="text-sm text-gray-500">
            {t("bookings.createdBy")}
          </span>

          <UserBadge
            name={resolveUserDisplayName(creator)}
            img={creator.profilePicture}
          />
        </div>

        {autoArchivedAt && status === "ARCHIVED" && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {t("bookings.automaticallyArchived")}
              </span>
              <span className="text-end font-medium">
                <DateS date={autoArchivedAt} />
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
