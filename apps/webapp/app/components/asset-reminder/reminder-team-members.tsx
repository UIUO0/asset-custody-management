import type { CSSProperties, ReactNode } from "react";
import type { Prisma } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { tw } from "~/utils/tw";
import { resolveTeamMemberName } from "~/utils/user";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../shared/tooltip";
import When from "../when/when";

type ReminderTeamMembersProps = {
  className?: string;
  style?: CSSProperties;
  teamMembers: Prisma.TeamMemberGetPayload<{
    select: {
      id: true;
      name: true;
      user: {
        select: {
          id: true;
          firstName: true;
          lastName: true;
          displayName: true;
          profilePicture: true;
        };
      };
    };
  }>[];
  imgClassName?: string;
  extraContent?: ReactNode;
  isAlreadySent?: boolean;
};

export default function ReminderTeamMembers({
  className,
  style,
  teamMembers,
  imgClassName,
  extraContent,
  isAlreadySent = false,
}: ReminderTeamMembersProps) {
  const { t } = useTranslation();

  return (
    <div className={tw("flex items-center", className)} style={style}>
      {teamMembers.map((teamMember) => {
        const isAccessRevoed = !teamMember.user;

        return (
          <TooltipProvider key={teamMember.id}>
            <Tooltip>
              <TooltipTrigger>
                <Link
                  to={`/settings/team/users/${teamMember?.user?.id}/assets`}
                  style={{ pointerEvents: isAccessRevoed ? "none" : "auto" }}
                  className={tw(
                    "-ms-1 flex size-6 shrink-0 items-center justify-center overflow-hidden rounded border border-static-white",
                    imgClassName,
                    isAccessRevoed && "border-error-500",
                  )}
                >
                  <img
                    alt={teamMember.name}
                    className="size-full object-cover"
                    src={
                      teamMember?.user?.profilePicture ??
                      "/static/images/default_pfp.jpg"
                    }
                  />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-72">
                <p>{resolveTeamMemberName(teamMember, true)}</p>

                <When truthy={isAccessRevoed && !isAlreadySent}>
                  <p className="mt-2 text-error-500">
                    {t("reminders.removedMemberHint")}
                  </p>
                </When>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}

      {extraContent}
    </div>
  );
}
