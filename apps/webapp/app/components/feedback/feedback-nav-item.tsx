import { useSetAtom } from "jotai";
import { MessageCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { feedbackModalOpenAtom } from "~/atoms/feedback";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/layout/sidebar/sidebar";

export default function FeedbackNavItem() {
  const { t } = useTranslation();
  const openFeedbackModal = useSetAtom(feedbackModalOpenAtom);
  const { isMobile, setOpenMobile } = useSidebar();

  const handleOpen = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    openFeedbackModal(true);
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="font-semibold"
        tooltip={t("nav.feedback")}
        onClick={handleOpen}
      >
        <MessageCircleIcon className="size-4 text-gray-600" />
        <span>{t("nav.feedback")}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
