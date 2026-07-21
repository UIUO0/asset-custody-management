import type { ComponentProps } from "react";
import { ShelfSidebarLogo } from "~/components/marketing/logos";
import { useInlineStartSide } from "~/hooks/use-direction";
import { useSidebarNavItems } from "~/hooks/use-sidebar-nav-items";
import OrganizationSelector from "./organization-selector";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "./sidebar";
import SidebarNav from "./sidebar-nav";
import SidebarUserMenu from "./sidebar-user-menu";

type AppSidebarProps = ComponentProps<typeof Sidebar>;

export default function AppSidebar(props: AppSidebarProps) {
  const { state } = useSidebar();
  const inlineStartSide = useInlineStartSide();
  const { topMenuItems, bottomMenuItems } = useSidebarNavItems();

  return (
    // The sidebar sits at the inline start of the page, so it moves to the
    // right edge in Arabic. `side` is a physical prop (it drives fixed
    // positioning and the mobile sheet direction), hence the explicit mapping.
    <Sidebar collapsible="icon" side={inlineStartSide} {...props}>
      <SidebarHeader className={state === "collapsed" ? "px-0" : ""}>
        <div className="my-2 flex items-center">
          <ShelfSidebarLogo minimized={state === "collapsed"} />
        </div>

        <OrganizationSelector />
      </SidebarHeader>

      <SidebarContent>
        <SidebarNav items={topMenuItems} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarNav className="p-0" items={bottomMenuItems} />
        <SidebarUserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
