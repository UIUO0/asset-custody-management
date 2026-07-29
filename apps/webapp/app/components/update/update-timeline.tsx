import type { RenderableTreeNodes } from "@markdoc/markdoc";
import type { Update, UserUpdateRead } from "@prisma/client";
import { BellIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UpdateTimelineItem } from "./update-timeline-item";

type UpdateWithParsedContent = Omit<Update, "content"> & {
  content: string | RenderableTreeNodes;
  userReads: UserUpdateRead[];
  imageUrl: string | null;
};

interface UpdateTimelineProps {
  updates: UpdateWithParsedContent[];
}

export function UpdateTimeline({ updates }: UpdateTimelineProps) {
  const { t } = useTranslation();
  if (updates.length === 0) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-gray-100">
          <BellIcon className="size-10 text-gray-400" />
        </div>
        <h3 className="mb-2 text-xl font-semibold text-gray-900">
          {t("ui.noUpdatesYet")}
        </h3>
        <p className="text-sm text-gray-600">
          {t("ui.checkBackLaterForTheLatestNewsAndUpdates")}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {updates.map((update) => (
        <UpdateTimelineItem key={update.id} update={update} />
      ))}
    </div>
  );
}
