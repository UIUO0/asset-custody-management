import type { Prisma } from "@prisma/client";
import { Roles } from "@prisma/client";
import { useAtom } from "jotai";
import { ScanBarcodeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  data,
  redirect,
  Link,
  NavLink,
  Outlet,
  useFetchers,
  useLoaderData,
} from "react-router";
import { AtomsResetHandler } from "~/atoms/atoms-reset-handler";
import { feedbackModalOpenAtom } from "~/atoms/feedback";
import { ErrorContent } from "~/components/errors";

import FeedbackModal from "~/components/feedback/feedback-modal";
import {
  CommandPaletteButton,
  CommandPaletteRoot,
} from "~/components/layout/command-palette";
import AppSidebar from "~/components/layout/sidebar/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/layout/sidebar/sidebar";
import { SkipLinks } from "~/components/layout/skip-links";
import { useCrisp } from "~/components/marketing/crisp";
import { ShelfMobileLogo } from "~/components/marketing/logos";
import { SequentialIdMigrationModal } from "~/components/sequential-id-migration-modal";
import { Spinner } from "~/components/shared/spinner";
import { Toaster } from "~/components/shared/toast";
import { MissingPaymentMethodBanner } from "~/components/subscription/missing-payment-method-banner";
import { NoSubscription } from "~/components/subscription/no-subscription";
import { UnpaidInvoiceBanner } from "~/components/subscription/unpaid-invoice-banner";
import { config } from "~/config/shelf.config";
import ar from "~/i18n/locales/ar.json";
import en from "~/i18n/locales/en.json";
import { countPendingBookingRequests } from "~/modules/booking/request.server";
import { getBookingSettingsForOrganization } from "~/modules/booking-settings/service.server";
import { countHandoversAwaitingMySignature } from "~/modules/custody/handover.server";
import { CHANGE_CURRENT_ORGANIZATION_ACTION } from "~/modules/organization/constants";
import {
  getSelectedOrganization,
  setSelectedOrganizationIdCookie,
} from "~/modules/organization/context.server";
import { getUnreadCountForUser } from "~/modules/update/service.server";
import { getUserByID } from "~/modules/user/service.server";
import { getWorkingHoursForOrganization } from "~/modules/working-hours/service.server";
import styles from "~/styles/layout/index.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import {
  expireHostOnlyUserPrefsCookie,
  initializePerPageCookieOnLayout,
  setCookie,
  userPrefs,
} from "~/utils/cookies.server";
import { isLikeShelfError, makeShelfError, ShelfError } from "~/utils/error";
import { isRouteError } from "~/utils/http";
import { payload, error } from "~/utils/http.server";
import { skipRevalidationOnClientViewChange } from "~/utils/list-view-params";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { userHasPermission } from "~/utils/permissions/permission.validator";
import type { CustomerWithSubscriptions } from "~/utils/stripe.server";

import {
  disabledTeamOrg,
  getCustomerActiveSubscription,
  getStripeCustomer,
  stripe,
  validateSubscriptionIsActive,
} from "~/utils/stripe.server";
import { canUseAudits, canUseBookings } from "~/utils/subscription.server";
import { tw } from "~/utils/tw";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export type LayoutLoaderResponse = typeof loader;

/**
 * The app-shell loader (user, org, subscription) does not depend on a page's
 * client-side view params (search/sort/page). Skip re-running it for same-path
 * client-view-only navigations so pages that filter client-side (e.g. the
 * booking overview) never trigger a shell refetch. Mutations and real
 * navigations still revalidate.
 */
export const shouldRevalidate = skipRevalidationOnClientViewChange;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    // Run user fetch and cookie parsing in parallel — these are independent
    // and safe to run before the onboarding guard.
    // NOTE: getSelectedOrganization is intentionally NOT included here.
    // It can throw when a user has no org membership, and the onboarding
    // guard (user.onboarded check) must run first to redirect non-onboarded
    // users before org resolution is attempted.
    const [user, userPrefsCookie] = await Promise.all([
      getUserByID(userId, {
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          profilePicture: true,
          onboarded: true,
          customerId: true,
          skipSubscriptionCheck: true,
          sso: true,
          tierId: true,
          hasUnpaidInvoice: true,
          warnForNoPaymentMethod: true,
          roles: { select: { id: true, name: true } },
          userOrganizations: {
            where: {
              userId: authSession.userId,
            },
            select: {
              id: true,
              roles: true,
              organization: { select: { id: true } },
            },
          },
        } satisfies Prisma.UserSelect,
      }),
      initializePerPageCookieOnLayout(request),
    ]);

    let subscription = null;

    if (user.customerId && stripe) {
      const customer = (await getStripeCustomer(
        user.customerId,
      )) as CustomerWithSubscriptions;
      subscription = getCustomerActiveSubscription({ customer });
      await validateSubscriptionIsActive({ user, subscription });
    }

    if (!user.onboarded) {
      return redirect("onboarding");
    }

    // Org resolution runs after the onboarding guard — safe now since
    // we know the user is onboarded and should have org membership.
    const {
      organizationId,
      organizations,
      currentOrganization,
      cookieRefreshNeeded,
      noVisibleOrganizations,
    } = await getSelectedOrganization({
      userId: authSession.userId,
      request,
    });

    // SSO user with no team orgs — redirect to a friendly pending page
    if (noVisibleOrganizations) {
      return redirect("/sso-pending-assignment");
    }

    const isAdmin = user?.roles.some((role) => role.name === Roles["ADMIN"]);

    // Get current user's organization role for updates filtering
    const currentOrganizationUserRoles = user?.userOrganizations.find(
      (userOrg) => userOrg.organization.id === organizationId,
    )?.roles;

    // Check if current user has OWNER or ADMIN role in the organization
    const isOwner = currentOrganizationUserRoles?.includes("OWNER");
    const isOrgAdmin = currentOrganizationUserRoles?.includes("ADMIN");

    // Check if sequential ID migration is needed
    const needsSequentialIdMigration =
      (isOwner || isOrgAdmin) && !currentOrganization.hasSequentialIdsMigrated;

    if (!organizations.length || !currentOrganization) {
      throw new ShelfError({
        cause: null,
        title: "No organization",
        message:
          "You are not part of any organization. Please contact support.",
        status: 403,
        label: "Organization",
      });
    }

    // Run booking settings, working hours, and unread count in parallel —
    // all only depend on organizationId/userId which are available now.
    /**
     * The requests badge is only fetched for the roles that can act on the
     * queue — nobody else's sidebar shows it, so counting for them would be a
     * query per page load for a number never rendered.
     */
    const canSeeRequests =
      userHasPermission({
        roles: currentOrganizationUserRoles ?? [],
        entity: PermissionEntity.booking,
        action: PermissionAction.approve,
      }) ||
      userHasPermission({
        roles: currentOrganizationUserRoles ?? [],
        entity: PermissionEntity.booking,
        action: PermissionAction.hold,
      });

    const [
      bookingSettings,
      workingHours,
      unreadUpdatesCount,
      pendingRequestCount,
      pendingHandoverCount,
    ] = await Promise.all([
      getBookingSettingsForOrganization(currentOrganization.id),
      getWorkingHoursForOrganization(currentOrganization.id),
      currentOrganizationUserRoles?.[0]
        ? getUnreadCountForUser({
            userId: authSession.userId,
            userRole: currentOrganizationUserRoles[0],
          })
        : Promise.resolve(0),
      canSeeRequests
        ? countPendingBookingRequests(currentOrganization.id)
        : Promise.resolve(0),
      /**
       * Counted for everyone, unlike the requests badge: anybody can be named
       * as the employee on a handover, so there is no role that provably never
       * has one waiting. The query is a single indexed lookup on the viewer's
       * own team-member row, not a workspace-wide scan.
       */
      countHandoversAwaitingMySignature({
        userId: authSession.userId,
        organizationId: currentOrganization.id,
      }),
    ]);

    return data(
      payload({
        user,
        organizations,
        currentOrganizationId: organizationId,
        bookingSettings,
        workingHours,
        currentOrganization,
        currentOrganizationUserRoles,
        subscription,
        enablePremium: config.enablePremiumFeatures,
        hideNoticeCard: userPrefsCookie.hideNoticeCard,
        minimizedSidebar: userPrefsCookie.minimizedSidebar,
        scannerCameraId: userPrefsCookie.scannerCameraId as string | undefined,
        isAdmin,
        canUseBookings: canUseBookings(currentOrganization),
        canUseAudits: canUseAudits(currentOrganization),
        unreadUpdatesCount,
        pendingRequestCount,
        pendingHandoverCount,
        hasUnpaidInvoice: user.hasUnpaidInvoice,
        warnForNoPaymentMethod: user.warnForNoPaymentMethod,
        needsSequentialIdMigration,
        /** THis is used to disable team organizations when the currentOrg is Team and no subscription is present  */
        disabledTeamOrg: isAdmin
          ? false
          : currentOrganization.workspaceDisabled ||
            (await disabledTeamOrg({
              currentOrganization,
              organizations,
              url: request.url,
            })),
      }),
      {
        headers: [
          setCookie(await userPrefs.serialize(userPrefsCookie)),
          expireHostOnlyUserPrefsCookie(),
          ...(cookieRefreshNeeded
            ? [setCookie(await setSelectedOrganizationIdCookie(organizationId))]
            : []),
        ],
      },
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { userId: authSession.userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ error, matches }) => {
  if (!error) {
    return [{ title: "" }];
  }

  // why: `meta` runs outside React — locale comes from the root loader.
  const rootData = matches.find((match) => match.id === "root")?.data as
    | { locale?: string }
    | undefined;
  const resources = rootData?.locale === "en" ? en : ar;

  let title = resources.errors.somethingWentWrong;

  if (isRouteError(error)) {
    title = error.data.error?.title ?? "";
  } else if (isLikeShelfError(error)) {
    title = error?.title ?? "";
  } else if (error instanceof Error) {
    title = error.name;
  }

  return [
    /** This will make sure that if we have an error its visible in the title of the browser tab */
    { title: appendToMetaTitle(title) },
  ];
};

export default function App() {
  const { t } = useTranslation();
  useCrisp();
  const {
    disabledTeamOrg,
    hasUnpaidInvoice,
    warnForNoPaymentMethod,
    minimizedSidebar,
    needsSequentialIdMigration,
    currentOrganizationId,
  } = useLoaderData<typeof loader>();
  const fetchers = useFetchers();
  /**
   * This used to also be forced true until hydration.
   *
   * The reason: authenticated routes call `userHasPermission` during render,
   * and it lived in a `.client.ts` module that RR7's vite plugin stubs to
   * `undefined` on the server — so SSR threw
   * `TypeError: userHasPermission is not a function`. Suppressing route SSR
   * until hydration hid that, but only for routes inside this subtree: the
   * sidebar and command palette render outside it and still crashed the whole
   * document with a bare 500.
   *
   * The validator now lives in a neutral module (`permission.validator.ts`)
   * that is safe on both sides, so the suppression is gone and these routes
   * server-render normally again. Keep it that way — if a permission check
   * ever breaks SSR again, fix the module, don't re-add the spinner.
   */
  const workspaceSwitching = fetchers.some(
    (f) =>
      f.formAction === CHANGE_CURRENT_ORGANIZATION_ACTION &&
      (f.state === "submitting" || f.state === "loading"),
  );
  const [feedbackModalOpen, setFeedbackModalOpen] = useAtom(
    feedbackModalOpenAtom,
  );

  return (
    <CommandPaletteRoot>
      <SidebarProvider defaultOpen={!minimizedSidebar}>
        <SkipLinks />
        <AtomsResetHandler />
        <AppSidebar id="navigation" />
        <SidebarInset id="main-content" tabIndex={-1}>
          {warnForNoPaymentMethod ? <MissingPaymentMethodBanner /> : null}
          {hasUnpaidInvoice ? <UnpaidInvoiceBanner /> : null}
          {disabledTeamOrg ? (
            <NoSubscription />
          ) : workspaceSwitching ? (
            <div className="flex size-full flex-col items-center justify-center text-center">
              <Spinner />
              <p className="mt-2">{t("ui.activatingWorkspace")}</p>
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between border-b bg-white py-4 md:hidden">
                <Link to="." title={t("nav.home")} className="block h-8">
                  <ShelfMobileLogo />
                </Link>
                <div className="flex items-center space-x-2">
                  <CommandPaletteButton variant="icon" />
                  <NavLink
                    to="/scanner"
                    title={t("ui.scanQrCode")}
                    className={({ isActive }) =>
                      tw(
                        "relative flex items-center justify-center px-2 transition",
                        isActive ? "text-primary-600" : "text-gray-500",
                      )
                    }
                  >
                    <ScanBarcodeIcon />
                  </NavLink>
                  <SidebarTrigger />
                </div>
              </header>
              <Outlet />
            </>
          )}
          <Toaster />

          {/* Sequential ID Migration Modal */}
          {needsSequentialIdMigration ? (
            // `key` remounts the modal when the active organization changes,
            // resetting its internal state without needing a derived-state effect.
            <SequentialIdMigrationModal
              key={currentOrganizationId}
              organizationId={currentOrganizationId}
            />
          ) : null}

          <FeedbackModal
            open={feedbackModalOpen}
            onClose={() => setFeedbackModalOpen(false)}
          />
        </SidebarInset>
      </SidebarProvider>
    </CommandPaletteRoot>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
