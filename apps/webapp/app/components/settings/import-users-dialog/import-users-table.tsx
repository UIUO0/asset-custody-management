import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { ORGANIZATION_ROLE_LABEL_KEYS } from "~/utils/roles";
import { tw } from "~/utils/tw";
import type { InviteUserFormSchema } from "../invite-user-dialog";

type ImportUsersTableProps = {
  className?: string;
  style?: CSSProperties;
  title: string;
  users: z.infer<typeof InviteUserFormSchema>[];
};

export default function ImportUsersTable({
  className,
  style,
  title,
  users,
}: ImportUsersTableProps) {
  const { t } = useTranslation();

  return (
    <div
      className={tw(
        "relative w-full overflow-x-auto rounded-md border",
        className,
      )}
      style={style}
    >
      <h4 className="px-6 py-3 text-start">{title}</h4>

      <table className="w-full text-start text-sm">
        <thead className="bg-gray-50 text-xs uppercase">
          <tr>
            <th scope="col" className="px-6 py-3">
              {t("team.emailAddress")}
            </th>
            <th scope="col" className="px-6 py-3">
              {t("team.role")}
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.email}>
              <td className="px-6 py-4">{user.email}</td>
              <td className="px-6 py-4">
                {t(ORGANIZATION_ROLE_LABEL_KEYS[user.role])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
