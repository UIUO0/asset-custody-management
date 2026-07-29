import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { CHANGE_CURRENT_ORGANIZATION_ACTION } from "~/modules/organization/constants";
import { isFormProcessing } from "~/utils/form";
import { tw } from "~/utils/tw";
import type { Error404AdditionalData } from "./utils";
import { getModelLabelForEnumValue } from "./utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../forms/select";
import { Button } from "../shared/button";

export type Error404HandlerProps = {
  className?: string;
  style?: CSSProperties;
  additionalData: Error404AdditionalData;
};

export default function Error404Handler({
  className,
  style,
  additionalData,
}: Error404HandlerProps) {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const disabled = isFormProcessing(fetcher.state);

  const content = useMemo(() => {
    switch (additionalData.model) {
      case "asset":
      case "kit":
      case "location":
      case "booking":
      case "audit":
      case "customField": {
        const modelLabel = getModelLabelForEnumValue(additionalData.model);

        return (
          <div className="flex flex-col items-center text-center">
            <div className="w-full md:max-w-screen-sm">
              <h2 className="mb-2">
                {t("errors.modelBelongsToAnotherWorkspace", {
                  model: modelLabel,
                })}
              </h2>
              <p className="mb-4">
                <Trans
                  i18nKey="errors.modelBelongsBody"
                  values={{
                    model: modelLabel,
                    workspace: additionalData.organization.organization.name,
                  }}
                  components={{ 1: <span className="font-bold" /> }}
                />
              </p>
              <fetcher.Form
                action={CHANGE_CURRENT_ORGANIZATION_ACTION}
                method="POST"
              >
                <input
                  type="hidden"
                  name="organizationId"
                  value={additionalData.organization.organization.id}
                />
                <input
                  type="hidden"
                  name="redirectTo"
                  value={additionalData.redirectTo}
                />
                <Button type="submit" disabled={disabled}>
                  {t("ui.switchWorkspace")}
                </Button>
              </fetcher.Form>
            </div>
          </div>
        );
      }

      /**
       * User can have a teamMember in multiple organizations, so in this case we
       * show a Select to choose from the organization and switch to that.
       **/
      case "teamMember": {
        return (
          <div className="flex flex-col items-center text-center">
            <div className="w-full md:max-w-screen-sm">
              <h2 className="mb-2">
                {t("errors.teamMemberBelongsToAnotherWorkspace")}
              </h2>
              <p className="mb-4">{t("errors.teamMemberBelongsBody")}</p>
              <fetcher.Form
                action={CHANGE_CURRENT_ORGANIZATION_ACTION}
                method="POST"
                className="flex flex-col items-center"
              >
                <Select name="organizationId" disabled={disabled}>
                  <SelectTrigger className="mb-4 max-w-80 px-3.5 py-2 text-start text-gray-500">
                    <SelectValue
                      placeholder={t("ui.selectWorkspaceToSwitch")}
                    />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    className="w-full min-w-80 overflow-auto p-1"
                    align="start"
                  >
                    {additionalData.organizations.map(({ organization }) => (
                      <SelectItem
                        value={organization.id}
                        key={organization.id}
                        className="px-4 py-2"
                      >
                        {organization.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="hidden"
                  name="redirectTo"
                  value={additionalData.redirectTo}
                />
                <Button type="submit" disabled={disabled}>
                  {t("ui.switchWorkspace")}
                </Button>
              </fetcher.Form>
            </div>
          </div>
        );
      }

      default: {
        return null;
      }
    }
  }, [additionalData, disabled, fetcher, t]);

  return (
    <div
      className={tw("flex size-full items-center justify-center", className)}
      style={style}
    >
      {content}
    </div>
  );
}
