import { useState, useRef } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";
import { AuditImageUploadSection } from "~/components/audit/audit-image-upload-box";
import { Button } from "~/components/shared/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/shared/modal";
import { useDisabled } from "~/hooks/use-disabled";

type CompleteAuditDialogProps = {
  /** Whether the button should be disabled */
  disabled?: boolean;
  /** Audit session name for display */
  auditName: string;
  /** Container for portal rendering */
  portalContainer?: HTMLElement;
  /** Stats for display in confirmation */
  stats: {
    expectedCount: number;
    foundCount: number;
    missingCount: number;
    unexpectedCount: number;
  };
};

/**
 * Dialog component for completing an audit with optional completion note.
 *
 * This component:
 * - Shows a confirmation dialog with audit statistics
 * - Allows user to add an optional text note
 * - Submits with intent="complete-audit"
 * - Dialog closes automatically on redirect after successful submission
 */
export default function CompleteAuditDialog({
  disabled,
  auditName,
  portalContainer,
  stats,
}: CompleteAuditDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formDisabled = useDisabled();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} variant="primary" type="button">
          {t("audits.completeAudit")}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent
        portalProps={{ container: portalContainer }}
        className="max-w-2xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => {
            textareaRef.current?.focus();
          });
        }}
      >
        <Form method="post" encType="multipart/form-data">
          <input type="hidden" name="intent" value="complete-audit" />

          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-success-500" />
              <AlertDialogTitle>{t("audits.completeAudit")}</AlertDialogTitle>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-6 top-6 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:pointer-events-none"
              disabled={formDisabled}
            >
              <X className="size-4" />
              <span className="sr-only">{t("common.close")}</span>
            </button>
          </AlertDialogHeader>

          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                You are about to complete the audit{" "}
                <span className="font-semibold text-gray-900">{auditName}</span>
                . This action cannot be undone.
              </p>

              <div className="rounded-lg bg-gray-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-gray-700">
                  {t("ui.auditSummary")}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Expected:</span>
                    <span className="font-medium">{stats.expectedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Found:</span>
                    <span className="font-medium text-success-600">
                      {stats.foundCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Missing:</span>
                    <span className="font-medium text-error-600">
                      {stats.missingCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Unexpected:</span>
                    <span className="font-medium text-warning-600">
                      {stats.unexpectedCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="completion-note"
                  className="text-sm font-medium text-gray-700"
                >
                  {t("audits.completionNoteOptional")}
                </label>
                <p className="text-sm text-gray-500">
                  {t("ui.addAnyFinalObservationsOrNotesAboutThisAudit")}
                </p>
                <textarea
                  ref={textareaRef}
                  id="completion-note"
                  name="note"
                  placeholder={t("ui.addCompletionNotesHere")}
                  className="min-h-[120px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-300/20"
                  rows={5}
                />
              </div>

              <AuditImageUploadSection maxCount={5} disabled={formDisabled} />
            </div>
          </AlertDialogDescription>

          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel asChild>
              <Button variant="secondary" type="button">
                {t("common.cancel")}
              </Button>
            </AlertDialogCancel>
            <Button type="submit" variant="primary" disabled={formDisabled}>
              {formDisabled ? "Completing..." : t("audits.completeAudit")}
            </Button>
          </AlertDialogFooter>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
