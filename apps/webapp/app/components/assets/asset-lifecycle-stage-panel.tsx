/**
 * Asset intake-stage panel (لوحة مرحلة استلام الأصل)
 *
 * Renders the state of an asset's `lifecycleStage` on the asset overview page,
 * plus the two transitions that move it:
 *
 * - `PENDING -> READY` — «اعتماد وإتاحة». المستودعات mark the asset ready once
 *   المالية have finished its financial coding. This is the moment the asset
 *   becomes visible and requestable by ordinary employees.
 * - `READY -> PENDING` — «إرجاع للمراجعة». Pulls the asset back out of
 *   circulation. A reason is mandatory, because this makes an asset employees
 *   could already see disappear; the reason is written to the asset's notes.
 *
 * Both buttons are rendered only for roles holding `asset.approve`. That is a
 * convenience, not the security boundary — the route action re-checks the
 * permission and the service layer re-checks the reason rule.
 *
 * @see {@link file://./../../routes/_layout+/assets.$assetId.overview.tsx}
 * @see {@link file://./../../modules/asset/service.server.ts} `updateAssetLifecycleStage`
 */

import { useEffect, useState } from "react";
import { AssetLifecycleStage } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import Input from "~/components/forms/input";
import { Dialog, DialogPortal } from "~/components/layout/dialog";
import { Button } from "~/components/shared/button";
import { useDisabled } from "~/hooks/use-disabled";
import { tw } from "~/utils/tw";

/** Props for {@link AssetLifecycleStagePanel} */
type AssetLifecycleStagePanelProps = {
  /** Current stage of the asset */
  stage: AssetLifecycleStage;
  /** Whether the viewer holds `asset.approve` — controls the action buttons */
  canApprove: boolean;
  /** Extra classes for the wrapper */
  className?: string;
  /** Action URL for the forms */
  action?: string;
};

/**
 * Banner showing the asset's intake stage and the approve / send-back actions.
 *
 * Renders nothing when the asset is already READY and the viewer cannot
 * approve — a distributable asset is the normal case and needs no banner.
 */
export function AssetLifecycleStagePanel({
  stage,
  canApprove,
  className,
  action,
}: AssetLifecycleStagePanelProps) {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const disabled = useDisabled(fetcher);
  const [isSendBackOpen, setIsSendBackOpen] = useState(false);

  const isPending = stage === AssetLifecycleStage.PENDING;

  /**
   * A READY asset is the steady state; only surface the panel to someone who
   * can act on it. PENDING is always surfaced — everyone who can see the asset
   * should understand why employees cannot.
   */
  if (!isPending && !canApprove) {
    return null;
  }

  return (
    <>
      <div
        className={tw(
          "mb-3 rounded-lg border p-4 md:flex md:items-center md:justify-between md:gap-4",
          isPending
            ? "border-warning-300 bg-warning-25"
            : "border-gray-200 bg-gray-25",
          className,
        )}
      >
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-gray-900">
            {isPending
              ? t("assetLifecycle.pendingTitle")
              : t("assetLifecycle.readyTitle")}
          </p>
          <p className="mt-0.5 text-[14px] text-gray-600">
            {isPending
              ? t("assetLifecycle.pendingDescription")
              : t("assetLifecycle.readyDescription")}
          </p>
        </div>

        {canApprove ? (
          <div className="mt-3 shrink-0 md:mt-0">
            {isPending ? (
              <fetcher.Form method="post" action={action}>
                <input
                  type="hidden"
                  name="intent"
                  value="updateLifecycleStage"
                />
                <input
                  type="hidden"
                  name="lifecycleStage"
                  value={AssetLifecycleStage.READY}
                />
                <Button type="submit" disabled={disabled}>
                  {t("assetLifecycle.approveAction")}
                </Button>
              </fetcher.Form>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsSendBackOpen(true)}
              >
                {t("assetLifecycle.sendBackAction")}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {isSendBackOpen ? (
        <SendBackDialog
          action={action}
          onClose={() => setIsSendBackOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Modal collecting the mandatory reason for a `READY -> PENDING` send-back.
 *
 * @param onClose - Closes the dialog (also called after a successful submit)
 */
function SendBackDialog({
  action,
  onClose,
}: {
  action?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher<{ error?: { message?: string } }>();
  const disabled = useDisabled(fetcher);
  const [reason, setReason] = useState("");

  /**
   * The action returns `{ error }` on failure, so an idle fetcher carrying data
   * without an error means the transition went through. Closing happens in an
   * effect rather than during render — the send-back failure path (a missing or
   * rejected reason) has to keep the dialog open with the message visible.
   */
  const submitFailed = Boolean(fetcher.data?.error);
  const submitSucceeded =
    fetcher.state === "idle" && Boolean(fetcher.data) && !submitFailed;

  useEffect(() => {
    if (submitSucceeded) {
      onClose();
    }
  }, [submitSucceeded, onClose]);

  return (
    <DialogPortal>
      <Dialog
        open
        onClose={onClose}
        className="sm:max-w-md"
        title={
          <h3 className="text-lg font-semibold">
            {t("assetLifecycle.sendBackTitle")}
          </h3>
        }
      >
        <fetcher.Form method="post" action={action} className="px-6 py-3 pt-0">
          <input type="hidden" name="intent" value="updateLifecycleStage" />
          <input
            type="hidden"
            name="lifecycleStage"
            value={AssetLifecycleStage.PENDING}
          />

          <p className="mb-4 text-[14px] text-gray-600">
            {t("assetLifecycle.sendBackDescription")}
          </p>

          <Input
            label={t("assetLifecycle.reasonLabel")}
            name="reason"
            inputType="textarea"
            rows={3}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("assetLifecycle.reasonPlaceholder")}
            error={submitFailed ? fetcher.data?.error?.message : undefined}
            className="w-full"
          />

          <div className="mt-4 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={disabled || reason.trim().length === 0}
            >
              {t("assetLifecycle.sendBackAction")}
            </Button>
          </div>
        </fetcher.Form>
      </Dialog>
    </DialogPortal>
  );
}
