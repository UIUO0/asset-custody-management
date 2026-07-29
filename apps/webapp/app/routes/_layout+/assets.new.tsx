const AssetLifecycleStage = { PENDING: "PENDING", READY: "READY" } as const;
const TagUseFor = { ASSET: "ASSET", BOOKING: "BOOKING" } as const;
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, redirectDocument, useLoaderData } from "react-router";
import { dynamicTitleAtom } from "~/atoms/dynamic-title-atom";
import {
  AssetForm,
  NewAssetBulkFormSchema,
  NewAssetFormSchema,
} from "~/components/assets/form";
import Header from "~/components/layout/header";
import { useSearchParams } from "~/hooks/search-params";
import { getFixedT, getLocale } from "~/i18n/i18n.server";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { estimateNextSequentialId } from "~/modules/asset/sequential-id.server";
import {
  bulkCreateAssetsFromModel,
  createAsset,
  getAllEntriesForCreateAndEdit,
  updateAssetMainImage,
} from "~/modules/asset/service.server";
import { getPrimaryLocation } from "~/modules/asset/utils";
import {
  getAssetModel,
  getAssetModels,
} from "~/modules/asset-model/service.server";
import { getActiveCustomFields } from "~/modules/custom-field/service.server";
import { createNote } from "~/modules/note/service.server";
import { assertWhetherQrBelongsToCurrentOrganization } from "~/modules/qr/service.server";
import { buildTagsSet } from "~/modules/tag/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { extractBarcodesFromFormData } from "~/utils/barcode-form-data.server";
import {
  extractCustomFieldValuesFromPayload,
  mergedSchema,
} from "~/utils/custom-fields";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError } from "~/utils/error";
import {
  assertIsPost,
  payload,
  error,
  getCurrentSearchParams,
  parseData,
} from "~/utils/http.server";
import { wrapLinkForNote, wrapUserLinkForNote } from "~/utils/markdoc-wrappers";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import { requirePermission } from "~/utils/roles.server";
import { slugify } from "~/utils/slugify";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, currentOrganization } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.create,
    });
    /**
     * We need to check if the QR code passed in the URL belongs to the current org
     * This is relevant whenever the user is trying to link a new asset with an existing QR code
     * */
    await assertWhetherQrBelongsToCurrentOrganization({
      request,
      organizationId,
    });

    const searchParams = getCurrentSearchParams(request);

    const [
      { categories, totalCategories, tags, locations, totalLocations },
      customFields,
      nextSequentialId,
      { assetModels, totalAssetModels },
    ] = await Promise.all([
      getAllEntriesForCreateAndEdit({
        organizationId,
        request,
        tagUseFor: TagUseFor.ASSET,
      }),
      getActiveCustomFields({
        organizationId,
        category: searchParams.get("category"),
      }),
      estimateNextSequentialId(organizationId),
      getAssetModels({ organizationId, page: 1, perPage: 100 }),
    ]);

    // Header copy is rendered server-side, so we resolve it with the request's
    // locale instead of the React hook.
    const t = await getFixedT(getLocale(request));
    const header = {
      title: t("assetForm.newAsset"),
    };

    return payload({
      header,
      categories,
      totalCategories,
      tags,
      totalTags: tags.length,
      locations,
      totalLocations,
      assetModels,
      totalAssetModels,
      currency: currentOrganization?.currency,
      customFields,
      nextSequentialId,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ matches }) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  return [{ title: appendToMetaTitle(resources.assetForm.newAsset) }];
};

/** Breadcrumb label for the new-asset page (component so it can use the hook). */
function NewAssetBreadcrumb() {
  const { t } = useTranslation();
  return <span>{t("assetForm.newAsset")}</span>;
}

export const handle = {
  breadcrumb: () => <NewAssetBreadcrumb />,
};

export async function action({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    assertIsPost(request);

    const { organizationId, canUseBarcodes, role } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.create,
    });

    /** Here we need to clone the request as we need 2 different streams:
     * 1. Access form data for creating asset
     * 2. Access form data via upload handler to be able to upload the file
     *
     * This solution is based on : https://github.com/remix-run/remix/issues/3971#issuecomment-1222127635
     */
    const clonedRequest = request.clone();

    const formData = await clonedRequest.formData();

    const customFields = await getActiveCustomFields({
      organizationId,
      category: formData.get("category") as string | null,
    });

    // Pick the same base schema the client used (NewAssetBulkFormSchema
    // tightens assetModelId + nameTemplate + count when `bulk=1`). Both
    // remain `ZodObject`s so `mergedSchema` can still layer the
    // category-driven custom fields on top.
    const isBulkSubmit =
      formData.get("bulk") === "1" || formData.get("bulk") === "true";
    const FormSchema = mergedSchema({
      // Cast the union to the base schema's type — `mergedSchema`'s
      // generic expects a single ZodObject shape. The bulk variant is
      // structurally a superset (same fields, stricter rules).
      baseSchema: (isBulkSubmit
        ? NewAssetBulkFormSchema
        : NewAssetFormSchema) as typeof NewAssetFormSchema,
      customFields: customFields.map((cf) => ({
        id: cf.id,
        name: slugify(cf.name),
        helpText: cf?.helpText || "",
        required: cf.required,
        type: cf.type.toLowerCase() as "text" | "number" | "date" | "boolean",
        options: cf.options,
      })),
    });

    const payload = parseData(formData, FormSchema);

    const customFieldsValues = extractCustomFieldValuesFromPayload({
      payload,
      customFieldDef: customFields,
    });

    const {
      title,
      description,
      category,
      assetModelId,
      qrId,
      newLocationId,
      valuation,
      addAnother,
      type,
      quantity,
      minQuantity,
      consumptionType,
      unitOfMeasure,
    } = payload;

    /** This checks if tags are passed and build the  */
    const tags = buildTagsSet(payload.tags);

    /**
     * The stage control is hidden from roles without `asset.approve`, but the
     * field travels in the form body — so re-check here rather than trusting
     * it. A caller who cannot approve always lands on PENDING, whatever they
     * posted. Applies to both the bulk and single-asset branches below.
     */
    const canApprove = userHasPermission({
      roles: role ? [role] : [],
      entity: PermissionEntity.asset,
      action: PermissionAction.approve,
    });
    const requestedStage = canApprove
      ? payload.lifecycleStage
      : AssetLifecycleStage.PENDING;

    // ── Bulk-create branch ────────────────────────────────────────────
    // When the form was submitted in bulk mode (`bulk=1` hidden input),
    // route through bulkCreateAssetsFromModel instead of createAsset.
    // The `NewAssetBulkFormSchema` picked above already validated
    // `assetModelId` (non-empty), `nameTemplate` (non-empty), and
    // `count` (whole number 2..100). Reaching this branch means those
    // are sound — we still surface server-level errors from
    // `bulkCreateAssetsFromModel` (org-scope + per-row mid-loop).
    if (isBulkSubmit) {
      // The bulk schema (`NewAssetBulkFormSchema`) guarantees these are
      // non-empty / non-NaN by the time we reach here. TS can't narrow
      // through the schema union, so assert locally with a single
      // typed binding rather than `!`-ing each call site.
      const validatedModelId = assetModelId as string;
      const count =
        typeof payload.count === "number"
          ? payload.count
          : Number(payload.count ?? 0);
      const startNumber =
        payload.startNumber !== undefined && payload.startNumber !== ""
          ? +payload.startNumber
          : 1;
      const nameTemplate = (payload.nameTemplate ?? "").trim();

      const result = await bulkCreateAssetsFromModel({
        // Same gate as the single-asset path below — a caller who cannot
        // approve always produces PENDING assets, however the form was posted.
        lifecycleStage: requestedStage,
        assetModelId: validatedModelId,
        count,
        nameTemplate,
        startNumber,
        organizationId,
        userId: authSession.userId,
        categoryId: category || undefined,
        valuation,
        description,
        locationId: newLocationId || undefined,
        tags,
        customFieldsValues,
      });

      // Mid-loop failure: surface the partial-success info to the user.
      if (result.failedAt !== undefined && result.error) {
        return data(error(result.error), { status: result.error.status });
      }

      // Resolve the model name once so the success modal can render
      // "Created N assets in {Model}" without an extra round-trip.
      const model = await getAssetModel({
        id: validatedModelId,
        organizationId,
      });

      sendNotification({
        title: "Assets created",
        message: `${result.createdAssetIds.length} assets created.`,
        icon: { name: "success", variant: "success" },
        senderId: authSession.userId,
      });

      return data({
        bulkSuccess: {
          createdAssetIds: result.createdAssetIds,
          assetModelId: validatedModelId,
          assetModelName: model.name,
        },
      });
    }

    /** Extract barcode data from form only if barcodes are enabled */
    const barcodes = canUseBarcodes
      ? extractBarcodesFromFormData(formData)
      : [];

    const asset = await createAsset({
      organizationId,
      lifecycleStage: requestedStage,
      title,
      description,
      userId: authSession.userId,
      categoryId: category,
      assetModelId: assetModelId || undefined,
      locationId: newLocationId,
      qrId,
      tags,
      valuation,
      customFieldsValues,
      barcodes,
      type,
      quantity,
      minQuantity,
      consumptionType,
      unitOfMeasure,
    });

    const actor = wrapUserLinkForNote({
      id: authSession.userId,
      firstName: asset.user.firstName,
      lastName: asset.user.lastName,
    });

    // Run independent post-creation tasks in parallel
    const postCreationTasks: Promise<unknown>[] = [
      updateAssetMainImage({
        request,
        assetId: asset.id,
        userId: authSession.userId,
        organizationId,
        isNewAsset: true,
      }),
      createNote({
        content: `Asset was created by ${actor}.`,
        type: "UPDATE",
        userId: authSession.userId,
        assetId: asset.id,
        organizationId,
      }),
    ];

    // The note only references the single primary location set at creation time;
    // qty-tracked assets can hold multiple AssetLocation rows but only one is primary.
    const primaryLocation = getPrimaryLocation(asset);
    if (primaryLocation) {
      const locationLink = wrapLinkForNote(
        `/locations/${primaryLocation.id}`,
        primaryLocation.name.trim(),
      );
      postCreationTasks.push(
        createNote({
          content: `${actor} set the location to ${locationLink}.`,
          type: "UPDATE",
          userId: authSession.userId,
          assetId: asset.id,
          organizationId,
        }),
      );
    }

    await Promise.all(postCreationTasks);

    sendNotification({
      title: "Asset created",
      message: "Your asset has been created successfully",
      icon: { name: "success", variant: "success" },
      senderId: authSession.userId,
    });

    /** If the user used the add-another button, we reload the document to reset the form */
    if (addAnother) {
      return redirectDocument(`/assets/new?`);
    }

    return redirect(`/assets`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function NewAssetPage() {
  const { t } = useTranslation();
  const title = useAtomValue(dynamicTitleAtom);
  const { nextSequentialId } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const qrId = searchParams.get("qrId");

  // Get category from URL params or use the default passed prop
  const categoryFromUrl = searchParams.get("category");

  // Bulk-create mode flag — set via `?bulk=1` query param from the
  // `+New` Popover dropdown on /assets, or from the asset form itself
  // when the user enables bulk-create after selecting a model. The
  // page header label and the form's field layout both branch on this.
  const bulkMode = searchParams.get("bulk") === "1";

  return (
    <div className="relative">
      <Header
        title={
          title
            ? title
            : bulkMode
            ? t("assetForm.bulkCreateAssets")
            : t("assetForm.untitled")
        }
      />
      <div>
        <AssetForm
          qrId={qrId}
          categoryId={categoryFromUrl}
          sequentialId={nextSequentialId}
          bulkMode={bulkMode}
        />
      </div>
    </div>
  );
}
