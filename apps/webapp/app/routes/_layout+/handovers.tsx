/**
 * Open handover records (محاضر بانتظار التوقيع)
 *
 * One page, two audiences, deliberately not two pages:
 *
 * - **The employee** sees the records naming them — a to-do list of things they
 *   must sign before an asset legally becomes (or stops being) theirs.
 * - **The warehouse** sees every open record in the workspace. A handover the
 *   employee never signs is the warehouse's problem to chase, and a stuck
 *   record nobody can see is a record nobody chases.
 *
 * The split is by data scope, not by route, so there is a single place where
 * "what counts as open" is defined. Two pages would drift.
 *
 * Sorted oldest-first: the longest-waiting record is the most overdue, and
 * burying it under newer entries is exactly how it gets forgotten. Same
 * reasoning as the requests queue.
 *
 * @see {@link file://./handovers_.$handoverId.tsx} — the signing page. The
 *   trailing underscore keeps it a sibling rather than a child of this route;
 *   nested, it would need an `<Outlet />` here and silently render nothing
 *   without one.
 * @see {@link file://./../../modules/custody/handover.server.ts}
 * @see {@link file://./../../../../docs/epda-custody-signatures.md}
 */

import { CustodyHandoverKind } from "@prisma/client";
import { useTranslation } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import { data, Link, useLoaderData } from "react-router";
import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import { Badge } from "~/components/shared/badge";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { db } from "~/database/db.server";
import { getFixedT, getLocale } from "~/i18n/i18n.server";
import { partyFor } from "~/modules/custody/handover";
import { listOpenHandovers } from "~/modules/custody/handover.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { rolesAreScopedToOwnRecords } from "~/utils/permissions/role-scope";
import { requirePermission } from "~/utils/roles.server";

export const meta = () => [{ title: appendToMetaTitle("Pending handovers") }];

export const handle = {
  breadcrumb: () => <Link to="/handovers">Handovers</Link>,
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    /**
     * Gated on `asset.read`, deliberately the weakest asset permission there
     * is — every workspace member holds it.
     *
     * Gating on `asset.custody` would have been the intuitive choice and is
     * wrong: `BASE` employees can *hold* custody without holding that
     * permission, which manages other people's custody. Requiring it locked
     * the very people the page exists for out of signing their own محاضر.
     *
     * Authorization here is not "may you open this page" but "which records
     * are yours" (the scope below) and "which slot may you sign"
     * ({@link resolveSignableParty}). Both are enforced per record.
     */
    const { organizationId, role } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.asset,
      action: PermissionAction.read,
    });

    const scopedToOwnRecords = rolesAreScopedToOwnRecords(role);

    const [handovers, ownMember] = await Promise.all([
      listOpenHandovers({ userId, organizationId, scopedToOwnRecords }),
      db.teamMember.findFirst({
        where: { organizationId, userId, deletedAt: null },
        select: { id: true },
      }),
    ]);

    // Title is resolved server-side from the request's locale rather than in
    // the component, because `HeaderData` is serialised in the loader payload.
    const t = await getFixedT(getLocale(request));
    const header: HeaderData = { title: t("custodySignature.pageTitle") };

    return payload({
      header,
      scopedToOwnRecords,
      ownTeamMemberId: ownMember?.id ?? null,
      handovers: handovers.map((handover) => {
        const counterpartySlot = partyFor(handover.kind, "counterparty");
        const warehouseSlot = partyFor(handover.kind, "warehouse");
        const signed = new Set(handover.signatures.map((s) => s.party));

        return {
          ...handover,
          counterpartySigned: signed.has(counterpartySlot),
          warehouseSigned: signed.has(warehouseSlot),
          // Precomputed here so the row does not have to re-derive the party
          // mapping — the one calculation in this feature that is easy to
          // invert by accident.
          waitingOnMe:
            ownMember?.id === handover.counterpartyTeamMemberId &&
            !signed.has(counterpartySlot),
        };
      }),
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

/**
 * The pending-handovers list.
 *
 * @returns The rendered page
 */
export default function HandoversPage() {
  const { handovers, scopedToOwnRecords } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  return (
    <>
      <Header />

      <div className="mt-4 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {handovers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {t("custodySignature.noPending")}
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {handovers.map((handover) => (
              <li
                key={handover.id}
                className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {handover.assets.length === 1
                        ? handover.assets[0].asset.title
                        : t("custodySignature.assetCount", {
                            count: handover.assets.length,
                          })}
                    </span>
                    <Badge color={handover.waitingOnMe ? "#B54708" : "#475467"}>
                      {handover.kind === CustodyHandoverKind.HANDOVER
                        ? t("custodySignature.handoverTitle")
                        : t("custodySignature.returnTitle")}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    <span className="font-mono">{handover.reference}</span>
                    <span className="mx-2">·</span>
                    <span>{handover.counterparty.name}</span>
                    <span className="mx-2">·</span>
                    <DateS date={handover.createdAt} />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {handover.warehouseSigned
                      ? t("custodySignature.warehouseSigned")
                      : t("custodySignature.warehouseNotSigned")}
                    {" · "}
                    {handover.counterpartySigned
                      ? t("custodySignature.employeeSigned")
                      : t("custodySignature.employeeNotSigned")}
                  </div>
                </div>

                <Button
                  to={`/handovers/${handover.id}`}
                  variant={handover.waitingOnMe ? "primary" : "secondary"}
                  size="sm"
                >
                  {handover.waitingOnMe
                    ? t("custodySignature.signNow")
                    : t("custodySignature.viewRecord")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!scopedToOwnRecords ? (
        <p className="mt-3 text-sm text-gray-500">
          {t("custodySignature.operatorListHint")}
        </p>
      ) : null}
    </>
  );
}
