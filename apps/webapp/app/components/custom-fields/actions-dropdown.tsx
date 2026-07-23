import type { CustomField } from "@prisma/client";
import { useTranslation } from "react-i18next";
import { VerticalDotsIcon } from "~/components/icons/library";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/shared/dropdown";
import { DeleteCustomFieldDialog } from "./delete-dialog";
import { Button } from "../shared/button";

export function ActionsDropdown({ customField }: { customField: CustomField }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className="outline-none focus-visible:border-0"
        aria-label={t("customFields.actionsTrigger")}
      >
        <i className="inline-block px-3 py-0 text-gray-400 ">
          <VerticalDotsIcon />
        </i>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="order w-[200px] rounded-md bg-white p-0 text-end "
      >
        <DropdownMenuItem className="px-4 py-3">
          <Button
            to={`${customField.id}/edit`}
            icon="pen"
            role="link"
            variant="link"
            className="justify-start text-gray-700 hover:text-gray-700"
            width="full"
          >
            {t("customFields.edit")}
          </Button>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-gray-100" />
        <DeleteCustomFieldDialog customField={customField} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
