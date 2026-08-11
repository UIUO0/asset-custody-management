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
              // `title` gives the sentence on hover; `aria-label` gives it to a
              // screen reader, which would otherwise announce a bare digit with
              // nothing to attach it to.
              title={route.badge.label}
              aria-label={route.badge.label}
              className={tw(
                "ms-auto inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                route.badge.variant === "unread" &&
                  "bg-primary-50 text-primary-700",
                // Work waiting on this viewer — warmer than the neutral pill so
                // a backlog does not read as a passive total.
                route.badge.variant === "action" &&
                  "bg-warning-50 text-warning-700",
                !route.badge.variant && "bg-gray-100 text-gray-700",
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
