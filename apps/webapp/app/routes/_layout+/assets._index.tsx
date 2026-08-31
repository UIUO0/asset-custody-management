import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { AssetsList } from "~/components/assets/assets-index/assets-list";
import Header from "~/components/layout/header";
import { Button } from "~/components/shared/button";
import When from "~/components/when/when";
import { db } from "~/database/db.server";

import { useAssetIndexViewState } from "~/hooks/use-asset-index-view-state";
import { useUserRoleHelper } from "~/hooks/user-user-role-helper";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import {
  advancedModeLoader,
  simpleModeLoader,
} from "~/modules/asset/data.server";
import { bulkDeleteAssets } from "~/modules/asset/service.server";
import { CurrentSearchParamsSchema } from "~/modules/asset/utils.server";
import {
  CreatePresetFormSchema,
  RenamePresetFormSchema,
  DeletePresetFormSchema,
} from "~/modules/asset-filter-presets/schemas";
import {
  createPreset,
  deletePreset,
  togglePresetStar,
  listPresetsForUser,
  renamePreset,
} from "~/modules/asset-filter-presets/service.server";
import {
  changeMode,
  getAssetIndexSettings,
} from "~/modules/asset-index-settings/service.server";
import assetCss from "~/styles/assets.css?url";
import calendarStyles from "~/styles/layout/calendar.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { checkExhaustiveSwitch } from "~/utils/check-exhaustive-switch";

import { sendNotification } from "~/utils/emitter/send-notification.server";
import { ShelfError, makeShelfError } from "~/utils/error";
import { payload, error, parseData } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { requirePermission } from "~/utils/roles.server";

export type AssetIndexLoaderData = typeof loader;

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: assetCss },
  { rel: "stylesheet", href: calendarStyles },
];

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  try {
    /** Validate permissions and fetch user */
    const [
      {
        organizationId,
        organizations,
        currentOrganization,
        role,
        canUseBarcodes,
      },
      user,
    ] = await Promise.all([
      requirePermission({
        userId,
        request,
        entity: PermissionEntity.asset,
        action: PermissionAction.read,
      }),
      db.user
        .findUniqueOrThrow({
          where: {
            id: userId,
          },
          select: {
            firstName: true,
            displayName: true,
          },
        })
        .catch((cause) => {
          throw new ShelfError({
            cause,
            message:
              "We can't find your user data. Please try again or contact support.",
            additionalData: { userId },
            label: "Assets",
          });
        }),
    ]);

    const settings = await getAssetIndexSettings({
      userId,
      organizationId,
      canUseBarcodes,
      role,
    });
    const mode = settings.mode;

    /** For base and self service users, we dont allow to view the advanced index */
    if (mode === "ADVANCED" && ["BASE", "SELF_SERVICE"].includes(role)) {
      await changeMode({
        userId,
        organizationId,
        mode: "SIMPLE",
      });
      throw new ShelfError({
        cause: null,
        title: "Not allowed",
        message:
          "ليس لديك الصلاحية للوصول إلى الوضع المتقدم. سيتم إعادتك تلقائياً للوضع المبسط. يرجى إعادة تحميل الصفحة.",
        label: "Assets",
        status: 403,
        shouldBeCaptured: false,
      });
    }

    return mode === "SIMPLE"
      ? await simpleModeLoader({
          request,
          userId,
          organizationId,
          organizations,
          role,
          currentOrganization,
          user,
          settings,
        })
      : await advancedModeLoader({
          request,
          userId,
          organizationId,
          organizations,
          role,
          currentOrganization,
          user,
          settings,
        });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const formData = await request.formData();

    const IntentSchema = z.enum([
      "bulk-delete",
      "create-preset",
      "rename-preset",
      "delete-preset",
      "toggle-star-preset",
    ]);

    const { intent } = parseData(formData, z.object({ intent: IntentSchema }));

    const intent2ActionMap: Record<
      z.infer<typeof IntentSchema>,
      PermissionAction
    > = {
      "bulk-delete": PermissionAction.delete,
      "create-preset": PermissionAction.read,
      "rename-preset": PermissionAction.read,
      "delete-preset": PermissionAction.read,
      "toggle-star-preset": PermissionAction.read,
    };

    const { organizationId, canUseBarcodes, role } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: intent2ActionMap[intent],
    });

    // Fetch asset index settings to determine mode
    const settings = await getAssetIndexSettings({
      userId,
      organizationId,
      canUseBarcodes,
      role,
    });

    switch (intent) {
      case "bulk-delete": {
        const { assetIds, currentSearchParams } = parseData(
          formData,
          z
            .object({ assetIds: z.array(z.string()).min(1) })
            .and(CurrentSearchParamsSchema),
        );

        await bulkDeleteAssets({
          assetIds,
          organizationId,
          userId,
          currentSearchParams,
          settings,
        });

        sendNotification({
          title: "Assets deleted",
          message: "Your assets has been deleted successfully",
          icon: { name: "success", variant: "success" },
          senderId: authSession.userId,
        });

        return payload({ success: true });
      }

      case "create-preset": {
        const { name, query } = parseData(formData, CreatePresetFormSchema);

        await createPreset({
          organizationId,
          ownerId: userId,
          name,
          query,
        });

        const savedFilterPresets = await listPresetsForUser({
          organizationId,
          ownerId: userId,
        });

        return payload({ savedFilterPresets });
      }

      case "rename-preset": {
        const { presetId, name } = parseData(formData, RenamePresetFormSchema);

        await renamePreset({
          id: presetId,
          organizationId,
          ownerId: userId,
          name,
        });

        const savedFilterPresets = await listPresetsForUser({
          organizationId,
          ownerId: userId,
        });

        return payload({ savedFilterPresets });
      }

      case "delete-preset": {
        const { presetId } = parseData(formData, DeletePresetFormSchema);

        await deletePreset({
          id: presetId,
          organizationId,
          ownerId: userId,
        });

        const savedFilterPresets = await listPresetsForUser({
          organizationId,
          ownerId: userId,
        });

        return payload({ savedFilterPresets });
      }

      case "toggle-star-preset": {
        const { presetId, starred } = parseData(
          formData,
          z.object({
            presetId: z.string().min(1),
            starred: z.string().transform((val) => val === "true"),
          }),
        );

        await togglePresetStar({
          id: presetId,
          starred,
          organizationId,
          ownerId: userId,
        });

        const savedFilterPresets = await listPresetsForUser({
          organizationId,
          ownerId: userId,
        });

        return payload({ savedFilterPresets });
      }

      default: {
        checkExhaustiveSwitch(intent);
        return payload(null);
      }
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  /**
   * If we are toggling the sidebar, no need to revalidate this loader.
   * Revalidation happens in _layout
   */
  if (actionResult?.isTogglingSidebar) {
    return false;
  }

  return defaultShouldRevalidate;
}

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: the loader builds an English "<org>'s inventory" title, and `meta`
  // runs outside React so it cannot use the translation hook. The active
  // locale comes from the root loader, and the heading is read straight
  // from the resource bundles.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.assets.inventoryTitle) }];
};

export default function AssetIndexPage() {
  const { t } = useTranslation();
  const { roles } = useUserRoleHelper();
  const { modeIsAdvanced } = useAssetIndexViewState();

  return (
    <div className="relative">
      <Header
        title={t("assets.inventoryTitle")}
        hidePageDescription={modeIsAdvanced}
      >
        <When
          truthy={userHasPermission({
            roles,
            entity: PermissionEntity.asset,
            action: PermissionAction.create,
          })}
        >
          {/*
           * ORG: the split-button that offered "bulk create" and "import CSV"
           * is gone — both doors are closed. Stock enters only through
           * مذكرة/محضر استلام, so the index CTA opens the receipt form.
           */}
          <Button to="/receipts/new" icon="plus">
            {t("receipts.newReceipt")}
          </Button>
        </When>
      </Header>
      <AssetsList
        customEmptyStateContent={{
          title: t("assets.empty"),
          text: t("assets.emptyText"),
          newButtonRoute: "/receipts/new",
          newButtonContent: t("assets.emptyCta"),
        }}
      />
    </div>
  );
}
