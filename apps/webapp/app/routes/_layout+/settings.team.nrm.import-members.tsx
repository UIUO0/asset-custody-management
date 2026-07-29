import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { parseFormData } from "@remix-run/form-data-parser";
import { Trans, useTranslation } from "react-i18next";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher } from "react-router";
import Input from "~/components/forms/input";
import { UserIcon } from "~/components/icons/library";
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
import { WarningBox } from "~/components/shared/warning-box";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import type { CreateAssetFromContentImportPayload } from "~/modules/asset/types";
import { createTeamMemberIfNotExists } from "~/modules/team-member/service.server";
import styles from "~/styles/layout/custom-modal.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { assertUserCanImportNRM } from "~/utils/subscription.server";

export const meta = ({
  matches,
}: {
  matches: Array<{ id: string; data?: unknown }>;
}) => {
  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;
  return [{ title: appendToMetaTitle(resources.team.importMembers) }];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, organizations } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      action: PermissionAction.create,
    });
    await assertUserCanImportNRM({ organizationId, organizations });

    return payload({
      showModal: true,
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
    const { organizationId, organizations } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.teamMember,
      action: PermissionAction.create,
    });

    // Subscription assertion and form data parsing are independent — run in parallel
    const [, formData] = await Promise.all([
      assertUserCanImportNRM({ organizationId, organizations }),
      // Files are automatically stored in memory with parseFormData
      parseFormData(request),
    ]);

    const csvFile = formData.get("file") as File;
    const text = await csvFile.text();
    const memberNames = text.split(",").map((name) => name.trim());

    // Transform member names into format expected by createTeamMemberIfNotExists
    const importData: CreateAssetFromContentImportPayload[] = memberNames.map(
      (name) => ({
        key: "", // Required by type but unused
        title: "", // Required by type but unused
        tags: [], // Required by type but unused
        custodian: name,
      }),
    );

    await createTeamMemberIfNotExists({
      data: importData,
      organizationId,
    });

    return payload({ success: true });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export function links() {
  return [{ rel: "stylesheet", href: styles }];
}

export default function ImportNRMs() {
  const { t } = useTranslation();
  return (
    <>
      <div className="modal-content-wrapper">
        <div className="mb-4 inline-flex size-8 items-center justify-center  rounded-full bg-primary-100 p-2 text-primary-600">
          <UserIcon />
        </div>
        <div className="mb-5">
          <h4>{t("team.importMembers")}</h4>
          <p>
            {t("team.importMembersDesc")}
            <br />
            <ul className="list-inside list-disc ps-4">
              <li>{t("team.importIgnoreExisting")}</li>
              <li>{t("team.importSkipDuplicates")}</li>
            </ul>
            <WarningBox className="my-2">
              {t("team.importFinalWarning")}
            </WarningBox>
          </p>
        </div>
        <ImportForm />
      </div>
    </>
  );
}

function ImportForm() {
  const { t } = useTranslation();
  const [agreed, setAgreed] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);
  const fetcher = useFetcher<typeof action>();

  const { data, state } = fetcher;
  const disabled = isFormProcessing(state) || agreed !== t("ui.iAgree");
  const isSuccessful = data && !data.error && data.success;

  /** We use a controlled field for the file, because of the confirmation dialog we have.
   * That way we can disabled the confirmation dialog button until a file is selected
   */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event?.target?.files?.[0];
    if (selectedFile) {
      setSelectedFile(selectedFile);
    }
  };
  return (
    <fetcher.Form
      className="mt-4"
      method="post"
      ref={formRef}
      encType="multipart/form-data"
    >
      <Input
        type="file"
        name="file"
        label={t("team.selectTxtFile")}
        required
        onChange={handleFileSelect}
        accept=".txt"
      />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            title={t("team.confirmNrmImport")}
            disabled={!selectedFile}
            className="mt-4 w-full"
          >
            {t("team.confirmNrmImport")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("team.confirmNrmImport")}</AlertDialogTitle>
            {!isSuccessful ? (
              <>
                <AlertDialogDescription>
                  <Trans
                    i18nKey="team.importAgreeText"
                    components={{ 1: <b /> }}
                  />
                </AlertDialogDescription>
                <Input
                  type="text"
                  label={t("team.confirmation")}
                  name="agree"
                  value={agreed}
                  onChange={(e) => setAgreed(e.target.value as any)}
                  placeholder={t("ui.iAgree")}
                  pattern="^I AGREE$" // We use a regex to make sure the user types the exact string
                  required
                />
              </>
            ) : null}
          </AlertDialogHeader>
          {data?.error ? (
            <div>
              <b className="text-red-500">{data.error.message}</b>
              <p>{t("team.importFixTxt")}</p>
            </div>
          ) : null}

          {isSuccessful ? (
            <div>
              <b className="text-green-500">{t("team.success")}</b>
              <p>{t("team.importSuccessText")}</p>
            </div>
          ) : null}

          <AlertDialogFooter>
            {isSuccessful ? (
              <Button to="/settings/team/nrm" variant="secondary">
                {t("common.close")}
              </Button>
            ) : (
              <>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="secondary">
                    {t("common.cancel")}
                  </Button>
                </AlertDialogCancel>
                <Button
                  type="submit"
                  onClick={() => {
                    // Because we use a Dialog the submit buttons is outside of the form so we submit using the fetcher directly
                    void fetcher.submit(formRef.current);
                  }}
                  disabled={disabled}
                >
                  {isFormProcessing(fetcher.state)
                    ? "Importing..."
                    : t("common.import")}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fetcher.Form>
  );
}
