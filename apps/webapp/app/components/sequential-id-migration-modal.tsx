import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Button } from "~/components/shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/shared/modal";
import { Spinner } from "~/components/shared/spinner";
import type { action } from "~/routes/api+/generate-sequential-ids";

interface SequentialIdMigrationModalProps {
  /** Active organization id. Parent should pass this as `key` to remount the
   *  modal (and reset its state) when the active organization changes. */
  organizationId: string;
}

type MigrationState = "starting" | "running" | "completed" | "error";

/**
 * Combined migration state — keeps the status and user-facing message in a
 * single atom so they cannot drift and we avoid cascading setState calls.
 *
 * The message arrives one of two ways, so exactly one of these is set:
 * - `messageKey` for copy this component owns (resolved with `t()` at render)
 * - `message` for copy the server already localised via `getFixedT`
 */
type MigrationStatus = {
  state: MigrationState;
  messageKey?: string;
  message?: string;
};

/**
 * Seed status for the migration modal.
 *
 * `messageKey` holds an i18n key (not a translated string) because this lives at
 * module scope, where the `useTranslation` hook cannot run.
 */
const INITIAL_STATUS: MigrationStatus = {
  state: "starting",
  messageKey: "settings.settingUpSequentialIds",
};

export function SequentialIdMigrationModal(
  // `organizationId` is consumed by the parent as `key` to remount this modal
  // when the organization changes; no internal read is required.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _: SequentialIdMigrationModalProps,
) {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  // Status is stored as a single object so each transition is one setState.
  const [status, setStatus] = useState<MigrationStatus>(INITIAL_STATUS);

  // Auto-start migration when modal opens
  useEffect(() => {
    if (status.state === "starting") {
      setStatus({
        state: "running",
        messageKey: "settings.settingUpSequentialIds",
      });
      void fetcher.submit(
        {},
        { action: "/api/generate-sequential-ids", method: "post" },
      );
    }
  }, [status.state, fetcher]);

  // Handle fetcher response — single setState per branch avoids cascading updates.
  useEffect(() => {
    if (!fetcher.data) return;
    if ("success" in fetcher.data && fetcher.data.success) {
      // Modal will close automatically when loader revalidates and
      // hasSequentialIdsMigrated becomes true.
      setStatus({ state: "completed", message: fetcher.data.message });
    } else {
      setStatus(
        fetcher.data.message
          ? { state: "error", message: fetcher.data.message }
          : { state: "error", messageKey: "settings.sequentialIdsFailed" },
      );
    }
  }, [fetcher.data]);

  const { state, message, messageKey } = status;
  /** Server-provided copy is already localised; our own copy is a key. */
  const displayMessage = messageKey ? t(messageKey) : message;

  return (
    <AlertDialog open={true}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-3">
            {state === "running" && <Spinner />}
            {state === "completed" && (
              <span className="text-green-600">✅</span>
            )}
            {state === "error" && <span className="text-red-600">❌</span>}
            {t("settings.sequentialAssetIds")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-start">
            {displayMessage}
            {state === "running" && (
              <div className="mt-3 text-sm text-gray-500">
                {t("ui.thisMayTakeAMomentDependingOnTheNumberOfAsse")}
              </div>
            )}
            {state === "error" && (
              <div className="mt-3">
                <Button
                  type="button"
                  onClick={() => window.location.reload()}
                  size="sm"
                  variant="secondary"
                >
                  {t("ui.tryAgain")}
                </Button>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="secondary"
              disabled={state !== "completed"}
            >
              {t("common.close")}
            </Button>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
