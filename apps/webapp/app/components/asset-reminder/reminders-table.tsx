import { useState } from "react";
import type { Prisma } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import colors from "tailwindcss/colors";
import type { ASSET_REMINDER_INCLUDE_FIELDS } from "~/modules/asset-reminder/fields";
import { List } from "../list";
import ReminderTeamMembers from "./reminder-team-members";
import SetOrEditReminderDialog from "./set-or-edit-reminder-dialog";
import { ListContentWrapper } from "../list/content-wrapper";
import { Filters } from "../list/filters";
import { SortBy } from "../list/filters/sort-by";
import { Badge } from "../shared/badge";
import { Button } from "../shared/button";
import { DateS } from "../shared/date";
import { Td, Th } from "../table";
import ActionsDropdown from "./actions-dropdown";
import When from "../when/when";

type RemindersTableProps = {
  isAssetReminderPage?: boolean;
};

export default function RemindersTable({
  isAssetReminderPage,
}: RemindersTableProps) {
  const { t } = useTranslation();
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const { assetId } = useParams<{ assetId: string }>();

  /** Sorting labels are translated, so the map is built per-render. */
  const sortingOptions = {
    name: t("reminders.sortName"),
    alertDateTime: t("reminders.sortAlertTime"),
    createdAt: t("reminders.sortDateCreated"),
    updatedAt: t("reminders.sortDateUpdated"),
  } as const;

  const emptyStateTitle = isAssetReminderPage
    ? t("reminders.emptyTitleAsset")
    : t("reminders.emptyTitle");

  return (
    <ListContentWrapper className="mb-4">
      <Filters
        slots={{
          "right-of-search": (
            <SortBy
              sortingOptions={sortingOptions}
              defaultSortingBy="alertDateTime"
            />
          ),
        }}
      />

      <List
        className="overflow-x-hidden"
        ItemComponent={ListContent}
        customEmptyStateContent={{
          title: emptyStateTitle,
          text: (
            <p>
              {t("reminders.emptyTextStart")}{" "}
              {isAssetReminderPage ? (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setIsReminderDialogOpen(true);
                  }}
                >
                  {t("reminders.emptyTextReminder")}
                </Button>
              ) : (
                t("reminders.emptyTextReminder")
              )}{" "}
              {t("reminders.emptyTextEnd")}
            </p>
          ),
        }}
        headerChildren={
          <>
            <Th>{t("reminders.message")}</Th>
            <When truthy={!isAssetReminderPage}>
              <Td>{t("reminders.asset")}</Td>
            </When>
            <Th>{t("reminders.alertDate")}</Th>
            <Th>{t("reminders.status")}</Th>
            <Th>{t("reminders.users")}</Th>
          </>
        }
        extraItemComponentProps={{ isAssetReminderPage }}
      />

      <SetOrEditReminderDialog
        action={isAssetReminderPage ? `/assets/${assetId}` : undefined}
        open={isReminderDialogOpen}
        onClose={() => {
          setIsReminderDialogOpen(false);
        }}
      />
    </ListContentWrapper>
  );
}

function ListContent({
  item,
  extraProps,
}: {
  item: Prisma.AssetReminderGetPayload<{
    include: typeof ASSET_REMINDER_INCLUDE_FIELDS;
  }>;
  extraProps: { isAssetReminderPage: boolean };
}) {
  const now = new Date();
  const status =
    now < new Date(item.alertDateTime) ? "Pending" : "Reminder sent";

  return (
    <>
      <Td className="md:min-w-60">{item.name}</Td>
      <Td className="max-w-62 md:max-w-96">{item.message}</Td>
      <When truthy={!extraProps.isAssetReminderPage}>
        <Td>
          <Button
            className="hover:underline"
            to={`/assets/${item.asset.id}/overview`}
            target="_blank"
            variant={"link-gray"}
          >
            {item.asset.title}
          </Button>
        </Td>
      </When>
      <Td>
        <DateS date={item.alertDateTime} includeTime />
      </Td>
      <Td>
        <Badge
          color={
            status === "Pending" ? colors.yellow["500"] : colors.green["500"]
          }
        >
          {status}
        </Badge>
      </Td>
      <Td>
        <ReminderTeamMembers
          teamMembers={item.teamMembers}
          isAlreadySent={status === "Reminder sent"}
        />
      </Td>
      <Td>
        <ActionsDropdown reminder={item} />
      </Td>
    </>
  );
}
