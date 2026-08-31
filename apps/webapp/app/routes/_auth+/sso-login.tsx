import { useTranslation } from "react-i18next";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  data,
  redirect,
  Form,
  useActionData,
  useNavigation,
} from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
import { config } from "~/config/shelf.config";
import { useAutoFocus } from "~/hooks/use-auto-focus";
import { getFixedT, getLocale } from "~/i18n/i18n.server";
import { getAuthConfig } from "~/modules/auth/auth-config.server";
import { signInWithSSO } from "~/modules/auth/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError, notAllowedMethod, ShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import {
  payload,
  error,
  getActionMethod,
  parseData,
} from "~/utils/http.server";
import { getLandingRouteForUser } from "~/utils/landing-route.server";
import { isValidDomain } from "~/utils/misc";

const SSOLoginFormSchema = z.object({
  domain: z
    .string()
    .transform((email) => email.toLowerCase())
    .refine(isValidDomain, () => ({
      message: "Please enter a valid domain name",
    })),
  redirectTo: z.string().optional(),
  // "mobile" routes the post-auth redirect to the native-app callback so the
  // companion app can complete SSO login (see signInWithSSO).
});

export async function loader({ context, request }: LoaderFunctionArgs) {
  // why: loaders run outside React, so `useTranslation` is unavailable —
  // `getFixedT` gives the same `t` bound to the request's locale.
  const t = await getFixedT(getLocale(request));
  const title = t("auth.logInWithSso");
  const subHeading = t("auth.enterDomainForSso");
  const { disableSSO } = config;

  try {
    if (context.isAuthenticated) {
      const { userId } = context.getSession();
      return redirect(await getLandingRouteForUser({ userId, request }));
    }

    /**
     * Two gates, deliberately both enforced.
     *
     * `DISABLE_SSO` is the process-level kill switch and always wins. Beyond
     * it, the admin settings screen decides whether a directory method is
     * selected and fully configured — this page must refuse when it is not,
     * because the login screen hides its own entry point under the same
     * condition and a user could still reach this URL directly.
     */
    const authConfig = await getAuthConfig();

    if (disableSSO || !authConfig.showSsoEntryPoint) {
      throw new ShelfError({
        cause: null,
        title: t("auth.ssoDisabled"),
        message:
          "For more information, please contact your workspace administrator.",
        label: "User onboarding",
        status: 403,
        shouldBeCaptured: false,
      });
    }

    return payload({ title, subHeading });
  } catch (cause) {
    const reason = makeShelfError(cause);
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const method = getActionMethod(request);

    switch (method) {
      case "POST": {
        const { domain } = parseData(
          await request.formData(),
          SSOLoginFormSchema,
          { shouldBeCaptured: false },
        );
        const url = await signInWithSSO(domain);

        return redirect(url);
      }
    }

    throw notAllowedMethod(method);
  } catch (cause) {
    const reason = makeShelfError(cause);
    return data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.title) : "" },
];

export default function SSOLogin() {
  const { t } = useTranslation();
  const zo = useZorm("NewQuestionWizardScreen", SSOLoginFormSchema);
  const navigation = useNavigation();
  const disabled = isFormProcessing(navigation.state);
  const data = useActionData<typeof action>();
  /** Focus the domain field on mount (intentional first-field focus on auth pages). */
  const domainInputRef = useAutoFocus<HTMLInputElement>();

  return (
    <>
      <div className="flex flex-col gap-3">
        <Form method="post" ref={zo.ref}>
          <div className="flex flex-col gap-3">
            <Input
              ref={domainInputRef}
              data-test-id="domain"
              label={t("auth.companyDomain")}
              placeholder="yourdomain.com"
              required
              name={zo.fields.domain()}
              type="text"
              autoComplete="domain"
              disabled={disabled}
              inputClassName="w-full"
              error={zo.errors.domain()?.message}
            />
            <Button
              className="text-center"
              type="submit"
              data-test-id="login"
              disabled={disabled}
              width="full"
            >
              {t("auth.logIn")}
            </Button>
          </div>
        </Form>
        {data?.error?.message && (
          <div className="text-sm text-error-500">{data.error.message}</div>
        )}
        {/* why: upstream pointed this at its own sales inbox. SSO for this
            deployment is an internal Azure AD (Entra ID) configuration, so the
            only correct recipient is the authority's own IT department.
            @see apps/docs/org-azure-entra-sso.md */}
        <div>{t("auth.needSsoAccess")}</div>
      </div>
    </>
  );
}
