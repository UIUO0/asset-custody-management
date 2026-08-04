/**
 * "Assets in my custody" page (الأصناف التي في عهدتي)
 *
 * The employee's own view of what they are holding. Open to every role — a
 * warehouse operator can be a custodian just as an ordinary employee can — and
 * scoped entirely to the signed-in user, so it needs no permission beyond
 * `asset.read`.
 *
 * Two lists, deliberately not merged:
 *
 * - **عهدة** — handed over with no end date.
 * - **مصروف بحجز** — out on a booking, due back on a date, can run overdue.
 *
 * @see {@link file://./../../modules/custody/my-custody.server.ts}
 */

import type { ReactNode } from "react";
import { useState } from "react";
import {
  BookingStatus,
  CustodyHandoverKind,
  CustodyHandoverState,
} from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { AssetImage } from "~/components/assets/asset-image/component";
import { ErrorContent } from "~/components/errors";
import Input from "~/components/forms/input";
import { Dialog, DialogPortal } from "~/components/layout/dialog";
import Header from "~/components/layout/header";
import { Badge } from "~/components/shared/badge";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { EmptyTableValue } from "~/components/shared/empty-table-value";
import { Table, Td, Th, Tr } from "~/components/table";
import { db } from "~/database/db.server";
import { useDisabled } from "~/hooks/use-disabled";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import type {
  MyCheckedOutItem,
  MyCustodyItem,
} from "~/modules/custody/my-custody.server";
import { getMyCustodyAndCheckouts } from "~/modules/custody/my-custody.server";
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
    /**
     * `asset.read` only — the page shows nothing but the caller's own holdings,
     * so there is nothing here that a stricter permission would protect.
     */
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    const { custodies, checkedOut } = await getMyCustodyAndCheckouts({
      organizationId,
      userId,
    });

    /**
     * Return records already open for these assets, keyed by asset id.
     *
     * Fetched so a row can offer "finish signing" instead of "request return"
     * when a محضر is already in flight — otherwise the employee taps a button
     * that appears to do nothing, because the service is (correctly) idempotent
     * and hands back the record that already exists.
     */
    const openReturns = await db.custodyHandover.findMany({
      where: {
        organizationId,
        kind: CustodyHandoverKind.RETURN,
        state: CustodyHandoverState.AWAITING_SIGNATURES,
        assetId: { in: custodies.map((custody) => custody.asset.id) },
      },
      select: { id: true, assetId: true },
    });

    return payload({
      // `<Header/>` reads this off loader data rather than taking it as a prop.
      header: { title: "My custody" },
      custodies,
      checkedOut,
      openReturnByAssetId: Object.fromEntries(
        openReturns.map((record) => [record.assetId, record.id]),
      ) as Record<string, string>,
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
  return [{ title: appendToMetaTitle(resources.nav.myCustody) }];
};

export const ErrorBoundary = () => <ErrorContent />;

export default function MyCustodyPage() {
  const { t } = useTranslation();
  const { custodies, checkedOut, openReturnByAssetId } =
    useLoaderData<typeof loader>();

  const holdsNothing = custodies.length === 0 && checkedOut.length === 0;

  return (
    <>
      <Header title={t("nav.myCustody")} hidePageDescription />

      {holdsNothing ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white px-6 py-16 text-center">
          <p className="text-[14px] font-medium text-gray-900">
            {t("myCustody.emptyTitle")}
          </p>
          <p className="mt-1 text-[14px] text-gray-600">
            {t("myCustody.emptyDescription")}
          </p>
        </div>
      ) : null}

      {custodies.length > 0 ? (
        <Section
          heading={t("myCustody.custodyHeading")}
          description={t("myCustody.custodyDescription")}
        >
          <Table>
            <thead>
              <tr>
                <Th>{t("myCustody.asset")}</Th>
                <Th>{t("assets.category")}</Th>
                <Th className="text-end">{t("myCustody.quantity")}</Th>
                <Th>{t("myCustody.source")}</Th>
                <Th>{t("myCustody.since")}</Th>
                <Th className="text-end">{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {custodies.map((custody) => (
                <CustodyRow
                  key={custody.id}
                  custody={custody}
                  openHandoverId={openReturnByAssetId[custody.asset.id]}
                />
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}

      {checkedOut.length > 0 ? (
        <Section
          heading={t("myCustody.checkedOutHeading")}
          description={t("myCustody.checkedOutDescription")}
        >
          <Table>
            <thead>
              <tr>
                <Th>{t("myCustody.asset")}</Th>
                <Th>{t("assets.category")}</Th>
                <Th className="text-end">{t("myCustody.quantity")}</Th>
                <Th>{t("myCustody.booking")}</Th>
                <Th>{t("myCustody.dueBack")}</Th>
              </tr>
            </thead>
            <tbody>
              {checkedOut.map((row) => (
                <CheckedOutRow key={row.id} row={row} />
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}
    </>
  );
}

/** A titled card wrapping one of the two tables. */
function Section({
  heading,
  description,
  children,
}: {
  heading: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white">
      <div className="border-b px-6 py-4">
        <h2 className="text-[16px] font-semibold text-gray-900">{heading}</h2>
        <p className="mt-1 text-[14px] text-gray-600">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** Asset thumbnail + name + SAM id, shared by both tables. */
function AssetCell({ asset }: { asset: MyCustodyItem["asset"] }) {
  return (
    <Td>
      <div className="flex items-center gap-3">
        {/*
          No `withPreview`, so the thumbnail-only shape is all this needs —
          the wider preview props would be an unused payload per row.
        */}
        <AssetImage
          asset={{ id: asset.id, thumbnailImage: asset.thumbnailImage }}
          alt={asset.title}
          className="size-10 shrink-0 rounded border object-cover"
        />
        <div className="min-w-0">
          <Button
            to={`/assets/${asset.id}/overview`}
            variant="link"
            className="text-start font-medium text-gray-900 hover:text-gray-700"
          >
            {asset.title}
          </Button>
          {asset.sequentialId ? (
            <p className="text-xs text-gray-500">{asset.sequentialId}</p>
          ) : null}
        </div>
      </div>
    </Td>
  );
}

/** Quantity, showing the unit for quantity-tracked assets. */
function QuantityCell({
  quantity,
  unitOfMeasure,
}: {
  quantity: number;
  unitOfMeasure?: string | null;
}) {
  return (
    <Td className="whitespace-nowrap text-end">
      {quantity}
      {unitOfMeasure ? ` ${unitOfMeasure}` : ""}
    </Td>
  );
}

/** Category badge, or a dash when uncategorised. */
function CategoryCell({
  category,
}: {
  category: MyCustodyItem["asset"]["category"];
}) {
  return (
    <Td>
      {category ? (
        <Badge color={category.color} withDot={false}>
          {category.name}
        </Badge>
      ) : (
        <EmptyTableValue />
      )}
    </Td>
  );
}

/**
 * "Request return" cell — a dialog asking why before it opens a محضر.
 *
 * A reason is mandatory because the warehouse triages this queue: a return with
 * no stated reason forces them to chase the person to find out what they are
 * about to receive and why. It is required by the service too, not just here —
 * the dialog is the prompt, the service is the rule.
 *
 * When a record is already open for the asset the button changes to "finish
 * signing" and links straight to it, rather than re-submitting. The service is
 * idempotent and would hand back the same record, which from the employee's
 * side looks like a button that does nothing.
 */
function RequestReturnCell({
  assetId,
  openHandoverId,
}: {
  assetId: string;
  openHandoverId?: string;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher<{ error?: { message?: string } }>();
  const disabled = useDisabled(fetcher);
  const [open, setOpen] = useState(false);

  if (openHandoverId) {
    return (
      <Td className="text-end">
        <Button
          to={`/handovers/${openHandoverId}`}
          variant="secondary"
          size="sm"
        >
          {t("myCustody.finishReturn")}
        </Button>
      </Td>
    );
  }

  return (
    <Td className="text-end">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {t("myCustody.requestReturn")}
      </Button>

      {/* Portalled: the dialog is rendered from inside a <td>, and a modal
          nested in a table cell inherits the table's stacking and overflow. */}
      <DialogPortal>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={<h4>{t("myCustody.requestReturnTitle")}</h4>}
        >
          <fetcher.Form
            method="post"
            action="/api/custody/request-return"
            className="p-6"
          >
            <input type="hidden" name="assetId" value={assetId} />

            <p className="mb-4 text-sm text-gray-600">
              {t("myCustody.requestReturnIntro")}
            </p>

            <div className="mb-4">
              <Input
                inputType="textarea"
                name="requestReason"
                label={t("myCustody.returnReason")}
                placeholder={t("myCustody.returnReasonPlaceholder")}
                required
                rows={3}
                /* Server-side error shown as the fallback: client validation can
                 be bypassed, and the service enforces the same rule. */
                error={fetcher.data?.error?.message}
              />
            </div>

            <div className="mb-5">
              <Input
                inputType="textarea"
                name="conditionNotes"
                label={t("custodySignature.conditionNotes")}
                placeholder={t("custodySignature.conditionNotesHint")}
                rows={2}
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                width="full"
                disabled={disabled}
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                width="full"
                disabled={disabled}
              >
                {t("myCustody.continueToSign")}
              </Button>
            </div>
          </fetcher.Form>
        </Dialog>
      </DialogPortal>
    </Td>
  );
}

/** One asset held on custody. */
function CustodyRow({
  custody,
  openHandoverId,
}: {
  custody: MyCustodyItem;
  openHandoverId?: string;
}) {
  const { t } = useTranslation();
  const { asset } = custody;

  return (
    <Tr>
      <AssetCell asset={asset} />
      <CategoryCell category={asset.category} />
      <QuantityCell
        quantity={custody.quantity}
        unitOfMeasure={asset.unitOfMeasure}
      />

      <Td>
        {/*
          A custody row inherited from a kit was never handed over asset by
          asset — saying "via <kit>" stops the employee wondering why an item
          they don't remember receiving is on their list.
        */}
        {custody.kitCustody?.kit ? (
          <Button
            to={`/kits/${custody.kitCustody.kit.id}`}
            variant="link"
            className="text-start font-normal text-gray-600"
          >
            {t("myCustody.viaKit", { name: custody.kitCustody.kit.name })}
          </Button>
        ) : (
          <span className="text-gray-600">
            {t("myCustody.assignedDirectly")}
          </span>
        )}
      </Td>

      <Td className="whitespace-nowrap">
        <DateS date={custody.createdAt} options={{ dateStyle: "medium" }} />
      </Td>

      <RequestReturnCell assetId={asset.id} openHandoverId={openHandoverId} />
    </Tr>
  );
}

/** One asset checked out to the user on an active booking. */
function CheckedOutRow({ row }: { row: MyCheckedOutItem }) {
  const { asset, booking } = row;
  const isOverdue = booking.status === BookingStatus.OVERDUE;

  return (
    <Tr>
      <AssetCell asset={asset} />
      <CategoryCell category={asset.category} />
      <QuantityCell
        quantity={row.quantity}
        unitOfMeasure={asset.unitOfMeasure}
      />

      <Td>
        <Button
          to={`/bookings/${booking.id}/overview`}
          variant="link"
          className="text-start font-normal text-gray-600"
        >
          {booking.name}
        </Button>
      </Td>

      <Td className="whitespace-nowrap">
        <span className={isOverdue ? "font-medium text-error-600" : undefined}>
          <DateS date={booking.to} options={{ dateStyle: "medium" }} />
        </span>
      </Td>
    </Tr>
  );
}
