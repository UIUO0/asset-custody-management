import type { ComponentProps } from "react";
import { NavLink } from "react-router";
import { useIsRouteActive } from "~/hooks/use-is-route-active";
import type { ChildNavItem as ChildNavItemType } from "~/hooks/use-sidebar-nav-items";
import { tw } from "~/utils/tw";
import { SidebarMenuButton, SidebarMenuItem } from "./sidebar";

type ChildNavItemProps = {
  route: ChildNavItemType;
  closeIfMobile?: () => void;
  tooltip: ComponentProps<typeof SidebarMenuButton>["tooltip"];
};

export default function ChildNavItem({
  route,
  closeIfMobile,
  tooltip,
}: ChildNavItemProps) {
  const isActive = useIsRouteActive(route.to);

  return (
    <SidebarMenuItem className="z-50">
      <SidebarMenuButton
        asChild
        disabled={!!route.disabled}
        tooltip={tooltip}
        onClick={closeIfMobile}
      >
        <NavLink
          to={route.to}
          target={route.target}
          className={tw(
            "font-semibold",
            isActive ? "bg-transparent font-bold text-primary" : "",
          )}
        >
          <route.Icon
            className={tw("size-4 text-gray-600", isActive && "text-primary")}
          />
          <span>{route.title}</span>
          {/*
            Count badge (e.g. pending requests). Rendered only when the item
            asks for it, so items without a badge keep their exact markup.
          */}
          {route.badge?.show ? (
            <span
              className={tw(
                "ms-auto inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                route.badge.variant === "unread"
                  ? "bg-primary-50 text-primary-700"
                  : "bg-gray-100 text-gray-700",
              )}
            >
              {route.badge.count}
            </span>
          ) : null}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
