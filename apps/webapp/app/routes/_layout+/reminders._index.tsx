import { useTranslation } from "react-i18next";
import { data } from "react-router";
import type {
  MetaFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "react-router";
import RemindersTable from "~/components/asset-reminder/reminders-table";
import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import { getFixedT, getLocale } from "~/i18n/i18n.server";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { getPaginatedAndFilterableReminders } from "~/modules/asset-reminder/service.server";
import { resolveRemindersActions } from "~/modules/asset-reminder/utils.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    // why: loaders run outside React, so `useTranslation` is unavailable —
    // `getFixedT` gives the same `t` bound to the request's locale.
    const t = await getFixedT(getLocale(request));

    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.assetReminders,
      action: PermissionAction.read,
    });

    const { page, perPage, reminders, totalPages, totalReminders, search } =
      await getPaginatedAndFilterableReminders({
        organizationId,
        request,
      });

    const header: HeaderData = { title: "Reminders" };
    const modelName = {
      singular: "reminder",
      plural: "reminders",
    };

    return payload({
      header,
      modelName,
      items: reminders,
      totalItems: totalReminders,
      page,
      perPage,
      totalPages,
      searchFieldLabel: t("search.remindersLabel"),
      searchFieldTooltip: {
        title: t("search.remindersTitle"),
        text: t("search.remindersText"),
      },
      search,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const userId = authSession.userId;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.assetReminders,
      action: PermissionAction.update,
    });

    return await resolveRemindersActions({
      request,
      organizationId,
      userId,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.nav.reminders) }];
};

export default function Reminders() {
  const { t } = useTranslation();

  return (
    <>
      <Header
        title={t("reminders.title")}
        subHeading={
          <>
            {t("reminders.subHeadingPrefix")}{" "}
            <b>{t("reminders.subHeadingAction")}</b>
          </>
        }
      />
      <RemindersTable />
    </>
  );
}
