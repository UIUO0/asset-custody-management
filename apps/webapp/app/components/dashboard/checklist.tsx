import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import type { loader } from "~/routes/_layout+/home";
import { tw } from "~/utils/tw";
import {
  AddUserIcon,
  AssetsIcon,
  CategoriesIcon,
  CheckmarkIcon,
  CustomFiedIcon,
  TagsIcon,
  UserIcon,
} from "../icons/library";
import { Button } from "../shared/button";
import Heading from "../shared/heading";
import SubHeading from "../shared/sub-heading";

export default function OnboardingChecklist() {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const { checklistOptions } = useLoaderData<typeof loader>();

  return (
    <div className="mt-6 rounded border bg-white px-4 py-5 lg:px-20 lg:py-16">
      <div className="mb-8">
        <Heading
          as="h2"
          className="break-all text-display-xs font-semibold md:text-display-sm"
        >
          {t("onboarding.welcome")}
        </Heading>
        <SubHeading>{t("onboarding.subtitle")}</SubHeading>
      </div>
      <div className="mb-8">
        <div className="mb-4">
          <h4 className=" text-lg font-semibold">
            {t("onboarding.sectionOrganize")}
          </h4>
          <p className="text-[14px] text-gray-600">
            {t("onboarding.sectionOrganizeText")}
          </p>
        </div>
        <ul className="onboarding-checklist -mx-1 xl:flex xl:flex-wrap">
          <li
            className={tw(
              " mx-1 mb-2 xl:w-[49%]",
              checklistOptions.hasAssets && "completed",
            )}
          >
            <div className="flex h-full items-start justify-between gap-1 rounded border p-4">
              <div className="flex items-start">
                <div className="me-3 inline-flex items-center justify-center rounded-full border-[5px] border-solid border-primary-50 bg-primary-100 p-1.5 text-primary">
                  <AssetsIcon />
                </div>
                <div className="text-[14px]">
                  <div className="mb-3">
                    <h6 className="font-medium text-gray-700">
                      {t("onboarding.assetTitle")}
                    </h6>
                    <p className=" text-gray-600">
                      {t("onboarding.assetText")}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="link" to="/receipts/new">
                      {t("assets.newAsset")}
                    </Button>
                  </div>
                </div>
              </div>
              <i className="hidden text-primary">
                <CheckmarkIcon />
              </i>
            </div>
          </li>
          <li
            className={tw(
              " mx-1 mb-2 xl:w-[49%]",
              checklistOptions.hasCategories && "completed",
            )}
          >
            <div className="flex h-full items-start justify-between gap-1 rounded border p-4">
              <div className="flex items-start">
                <div className="me-3 inline-flex items-center justify-center rounded-full border-[5px] border-solid border-primary-50 bg-primary-100 p-1.5 text-primary">
                  <CategoriesIcon />
                </div>
                <div className="text-[14px]">
                  <div className="mb-3">
                    <h6 className="font-medium text-gray-700">
                      {t("onboarding.categoryTitle")}
                    </h6>
                    <p className=" text-gray-600">
                      {t("onboarding.categoryText")}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="link" to="/categories/new">
                      {t("categories.newCategory")}
                    </Button>
                  </div>
                </div>
              </div>
              <i className="hidden text-primary">
                <CheckmarkIcon />
              </i>
            </div>
          </li>
          <li
            className={tw(
              " mx-1 mb-2 xl:w-[49%]",
              checklistOptions.hasTags && "completed",
            )}
          >
            <div className="flex h-full items-start justify-between gap-1 rounded border p-4">
              <div className="flex items-start">
                <div className="me-3 inline-flex items-center justify-center rounded-full border-[5px] border-solid border-primary-50 bg-primary-100 p-1.5 text-primary">
                  <TagsIcon />
                </div>
                <div className="text-[14px]">
                  <div className="mb-3">
                    <h6 className="font-medium text-gray-700">
                      {t("onboarding.tagTitle")}
                    </h6>
                    <p className=" text-gray-600">{t("onboarding.tagText")}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="link" to="/tags/new">
                      {t("tags.newTag")}
                    </Button>
                  </div>
                </div>
              </div>
              <i className="hidden text-primary">
                <CheckmarkIcon />
              </i>
            </div>
          </li>
        </ul>
      </div>
      <div className="mb-8">
        <div className="mb-4">
          <h4 className=" text-lg font-semibold">
            {t("onboarding.sectionTeam")}
          </h4>
          <p className="text-[14px] text-gray-600">
            {t("onboarding.sectionTeamText")}
          </p>
        </div>
        <ul className="onboarding-checklist -mx-1 xl:flex xl:flex-wrap">
          <li
            className={tw(
              " mx-1 mb-2 xl:w-[49%]",
              checklistOptions.hasTeamMembers && "completed",
            )}
          >
            <div className="flex h-full items-start justify-between gap-1 rounded border p-4">
              <div className="flex items-start">
                <div className="me-3 inline-flex items-center justify-center rounded-full border-[5px] border-solid border-primary-50 bg-primary-100 p-1.5 text-primary">
                  <UserIcon />
                </div>
                <div className="text-[14px]">
                  <div className="mb-3">
                    <h6 className="font-medium text-gray-700">
                      {t("onboarding.memberTitle")}
                    </h6>
                    <p className=" text-gray-600">
                      {t("onboarding.memberText")}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="link" to="/settings/team">
                      {t("onboarding.newTeamMember")}
                    </Button>
                  </div>
                </div>
              </div>
              <i className="hidden text-primary">
                <CheckmarkIcon />
              </i>
            </div>
          </li>
          <li
            className={tw(
              " mx-1 mb-2 xl:w-[49%]",
              checklistOptions.hasCustodies && "completed",
            )}
          >
            <div className="flex h-full items-start justify-between gap-1 rounded border p-4">
              <div className="flex items-start">
                <div className="me-3 inline-flex items-center justify-center rounded-full border-[5px] border-solid border-primary-50 bg-primary-100 p-1.5 text-primary">
                  <AddUserIcon />
                </div>
                <div className="text-[14px]">
                  <div className="mb-3">
                    <h6 className="font-medium text-gray-700">
                      {t("onboarding.custodyTitle")}
                    </h6>
                    <p className=" text-gray-600">
                      {t("onboarding.custodyText")}
                    </p>
                  </div>
                  <div className="flex gap-3"></div>
                </div>
              </div>
              <i className="hidden text-primary">
                <CheckmarkIcon />
              </i>
            </div>
          </li>
        </ul>
      </div>
      <div className="mb-8">
        <div className="mb-4">
          <h4 className=" text-lg font-semibold">
            {t("onboarding.sectionCustomize")}
          </h4>
          <p className="text-[14px] text-gray-600">
            {t("onboarding.sectionCustomizeText")}
          </p>
        </div>
        <ul className="onboarding-checklist -mx-1 xl:flex xl:flex-wrap">
          <li
            className={tw(
              " mx-1 mb-2 xl:w-[49%]",
              checklistOptions.hasCustomFields && "completed",
            )}
          >
            <div className="flex h-full items-start justify-between gap-1 rounded border p-4">
              <div className="flex items-start">
                <div className="me-3 inline-flex items-center justify-center rounded-full border-[5px] border-solid border-primary-50 bg-primary-100 p-1.5 text-primary">
                  <CustomFiedIcon />
                </div>
                <div className="text-[14px]">
                  <div className="mb-3">
                    <h6 className="font-medium text-gray-700">
                      {t("onboarding.customFieldTitle")}
                    </h6>
                    <p className=" text-gray-600">
                      {t("onboarding.customFieldText")}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="link" to="/settings/custom-fields/new">
                      {t("onboarding.newCustomField")}
                    </Button>
                  </div>
                </div>
              </div>
              <i className="hidden text-primary">
                <CheckmarkIcon />
              </i>
            </div>
          </li>
        </ul>
      </div>
      <fetcher.Form
        method="post"
        action="/api/user/prefs/skip-onboarding-checklist"
      >
        <input type="hidden" name="skipOnboardingChecklist" value="skipped" />
        <Button variant="link" type="submit">
          {t("onboarding.skipTour")}
        </Button>
      </fetcher.Form>
    </div>
  );
}
