import { useState } from "react";
import { LogOutIcon, UserPenIcon, UserRoundIcon, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useFetcher, useLoaderData } from "react-router";
import { ChevronRight } from "~/components/icons/library";
import { LanguageSwitcher } from "~/components/layout/appearance-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/shared/dropdown";
import ProfilePicture from "~/components/user/profile-picture";
import { useInlineEndSide } from "~/hooks/use-direction";
import type { loader } from "~/routes/_layout+/_layout";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./sidebar";

export default function SidebarUserMenu() {
  const { t } = useTranslation();
  const { user } = useLoaderData<typeof loader>();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { isMobile } = useSidebar();
  const inlineEndSide = useInlineEndSide();
  const fetcher = useFetcher();

  function closeDropdown() {
    setIsDropdownOpen(false);
  }

  function logOut() {
    void fetcher.submit(null, { action: "/logout", method: "POST" });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="!h-auto border !p-1 data-[state=open]:bg-gray-50 data-[state=open]:text-sidebar-accent-foreground hover:bg-gray-50"
            >
              <ProfilePicture
                width="w-8"
                height="h-8"
                className="me-3 shrink-0"
              />
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{user.username}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronRight className="ms-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded p-1"
            // Radix `side` is physical, so it must follow the reading
            // direction: the menu opens leftward in Arabic.
            side={isMobile ? "bottom" : inlineEndSide}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                <ProfilePicture
                  width="w-8"
                  height="h-8"
                  className="me-3 shrink-0"
                />
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user.username}
                  </span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              asChild
              className="cursor-pointer gap-2 border-b border-gray-200 p-2"
              onClick={closeDropdown}
            >
              <NavLink to="/me">
                <UserPenIcon className="size-4" />
                {t("nav.profile")}
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem
              asChild
              className="cursor-pointer gap-2 border-b border-gray-200 p-2"
              onClick={closeDropdown}
            >
              <NavLink to="/account-details">
                <UserRoundIcon className="size-4" />
                {t("settings.account")}
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem
              asChild
              className="cursor-pointer gap-2 border-b border-gray-200 p-2"
              onClick={closeDropdown}
            >
              <NavLink to="/account-details/subscription">
                <Wallet className="size-4" />
                {t("userMenu.subscriptions")}
              </NavLink>
            </DropdownMenuItem>
            {/* The language switcher lives in the menu (not a settings page)
                so it is one click away from anywhere. Wrapped in a plain div
                rather than DropdownMenuItem: it is a form, and a menu item
                would swallow the submit and close the menu. Dark mode is
                removed EPDA-wide, so there is no theme control. */}
            <div className="flex flex-col gap-2 border-b border-gray-200 p-2">
              <span className="text-xs font-medium text-gray-500">
                {t("common.language")}
              </span>
              <LanguageSwitcher />
            </div>
            <DropdownMenuItem
              className="mt-1 cursor-pointer gap-2 border-b border-gray-200 p-2"
              onSelect={logOut}
            >
              <LogOutIcon className="size-4" />
              {t("auth.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
