/**
 * Which settings sections exist, and the permission each one needs.
 *
 * One list, read by both halves of `/settings`: the layout loader uses it to
 * decide whether to let anyone in at all, and the tab strip uses it to decide
 * what to draw. They used to answer that question separately and disagreed —
 * the tabs were gated per-section while the loader demanded
 * `generalSettings.read` from everyone, so four of the six operational roles
 * saw «الفريق» in the sidebar and got *Unauthorized* on click: المستودعات،
 * المالية، المخزون، الإدارة.
 *
 * Only one section is left. It is kept as a list anyway, because collapsing it
 * to a hardcoded permission is exactly how the loader and the tabs drifted
 * apart the first time.
 *
 * **Removed, deliberately** — do not add them back without a reason:
 *
 * - `general` — workspace name, logo, SSO domain, ownership transfer. One
 *   authority, one workspace, set once.
 * - `custom-fields` and `asset-models` — both held **zero rows**, and neither
 *   is referenced anywhere in the goods-receipt intake flow, which is the only
 *   door stock enters by. ⚠️ The *screens* are gone; the underlying models are
 *   not — they are wired into import, export and the advanced index across
 *   ~78 and ~51 files respectively, and pulling those out is a behaviour
 *   change wearing cleanup's clothes.
 * - `emails` — outbound mail templates, not something the authority tunes.
 *
 * @see {@link file://./../../routes/_layout+/settings.tsx} the layout
 */

import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";

/** A settings tab and the permission its own loader enforces. */
export type SettingsSection = {
  /** Path segment under `/settings`, and the tab's `to`. */
  to: string;
  /** Translation key for the tab label. */
  labelKey: string;
  entity: PermissionEntity;
  action: PermissionAction;
  /** Hidden in personal workspaces, which have no team to manage. */
  organizationOnly?: boolean;
};

/** Every section, in tab order. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    to: "team",
    labelKey: "settings.team",
    entity: PermissionEntity.teamMember,
    action: PermissionAction.read,
  },
];
