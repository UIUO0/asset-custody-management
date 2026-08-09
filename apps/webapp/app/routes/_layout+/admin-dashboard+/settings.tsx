/**
 * `/admin-dashboard/settings` — instance-wide configuration.
 *
 * Groups every registry setting by category and posts the whole form back as
 * one batch, because the settings are only meaningful as a set: choosing OIDC
 * and entering its client secret are one decision, not two.
 *
 * ## Visibility
 *
 * Three independent gates, all of which must hold:
 *
 * 1. The parent `admin-dashboard+/_layout.tsx` loader calls `requireAdmin`, so
 *    the whole section 403s for anyone else.
 * 2. This route's own loader and action call `requireAdmin` too. A child route
 *    is fetched directly on client-side navigation and by `.data` requests, so
 *    inheriting the parent's gate is not sufficient — it has to be repeated
 *    wherever data is actually served.
 * 3. The sidebar entry for `/admin-dashboard` is hidden unless `isAdmin`, so
 *    the section is not merely inaccessible but invisible.
 *
 * Secret fields render as `••••••••` when set. Submitting an untouched secret
 * sends the placeholder back, and `updateSettings` skips it rather than
 * overwriting the real value — see that function for why.
 *
 * Not translated, matching every other page in `admin-dashboard+`.
 *
 * @see {@link file://./../../../modules/app-settings/registry.ts} what exists
 * @see {@link file://./../../api+/admin.settings.ts} the scripted equivalent
 */

import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { z } from "zod";
import { Form } from "~/components/custom-form";
import Input from "~/components/forms/input";
import { Switch } from "~/components/forms/switch";
import { Button } from "~/components/shared/button";
import type { SettingCategory } from "~/modules/app-settings/registry";
import type { AdminSettingView } from "~/modules/app-settings/service.server";
import {
  getSettingsForAdmin,
  updateSettings,
} from "~/modules/app-settings/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import { requireAdmin } from "~/utils/roles.server";

export const meta = () => [{ title: appendToMetaTitle("System settings") }];

/** Section headings and blurbs, in render order. */
const CATEGORY_SECTIONS: Array<{
  category: SettingCategory;
  title: string;
  description: string;
}> = [
  {
    category: "general",
    title: "General",
    description: "Identity and availability of the installation.",
  },
  {
    category: "auth",
    title: "Authentication",
    description:
      "Which identity source the login screen uses. App-wide admins can always sign in with a password, so a misconfigured directory cannot lock you out.",
  },
  {
    category: "saml",
    title: "SAML 2.0",
    description: "Used by the Microsoft Entra ID (Azure AD) integration.",
  },
  {
    category: "oidc",
    title: "OpenID Connect",
    description: "Connection details for an OIDC provider.",
  },
  {
    category: "ldap",
    title: "LDAP / Active Directory",
    description: "Direct directory binding for on-premise deployments.",
  },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    // Repeated deliberately — see the "Visibility" note in this module's header.
    await requireAdmin(userId);

    return payload({ settings: await getSettingsForAdmin() });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  const { userId } = context.getSession();

  try {
    await requireAdmin(userId);

    const formData = await request.formData();

    /**
     * Only fields the form actually rendered are considered, and each is
     * matched against the registry inside `updateSettings`. An extra field
     * posted by hand is rejected there rather than stored.
     *
     * Unchecked switches submit nothing at all, which is why booleans are read
     * from a companion hidden input rather than from the switch's presence.
     */
    const keys = formData.getAll("__settingKey").map(String);

    const updates = keys.map((key) => {
      const raw = formData.get(key);
      return { key, value: raw === null ? null : String(raw) };
    });

    const parsed = z
      .array(z.object({ key: z.string().min(1), value: z.string().nullable() }))
      .min(1, "No settings were submitted")
      .parse(updates);

    const updated = await updateSettings({ updates: parsed, userId });

    return payload({ updated, savedAt: new Date().toISOString() });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function AdminSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state !== "idle";

  const savedCount =
    actionData && "updated" in actionData ? actionData.updated : null;
  const errorMessage =
    actionData && "error" in actionData ? actionData.error?.message : null;

  return (
    <div className="mb-10">
      <div className="mb-6">
        <h2>System settings</h2>
        <p className="text-gray-600">
          Instance-wide configuration. These values apply to every workspace and
          are readable only by app-wide administrators.
        </p>
      </div>

      {errorMessage ? (
        <div className="mb-6 rounded border border-error-300 bg-error-50 p-4 text-error-700">
          {errorMessage}
        </div>
      ) : null}

      {savedCount !== null ? (
        <div className="mb-6 rounded border border-success-300 bg-success-50 p-4 text-success-700">
          Saved {savedCount} setting{savedCount === 1 ? "" : "s"}.
        </div>
      ) : null}

      <Form method="post" className="flex flex-col gap-8">
        {CATEGORY_SECTIONS.map((section) => {
          const fields = settings.filter(
            (setting) => setting.category === section.category,
          );

          if (fields.length === 0) return null;

          return (
            <section
              key={section.category}
              className="rounded border border-gray-200 p-6"
            >
              <h3 className="mb-1">{section.title}</h3>
              <p className="mb-6 text-sm text-gray-600">
                {section.description}
              </p>

              <div className="flex flex-col gap-5">
                {fields.map((setting) => (
                  <SettingField key={setting.key} setting={setting} />
                ))}
              </div>
            </section>
          );
        })}

        <div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </Form>
    </div>
  );
}

/**
 * One setting's control, chosen by its declared type.
 *
 * Every field also emits a hidden `__settingKey` so the action knows which keys
 * this form is responsible for — without it, a setting removed from the
 * registry could still be written by a stale open tab.
 *
 * @param props.setting - The redacted admin view of one setting
 */
function SettingField({ setting }: { setting: AdminSettingView }) {
  return (
    <div>
      <input type="hidden" name="__settingKey" value={setting.key} />
      {setting.type === "boolean" ? (
        <BooleanField setting={setting} />
      ) : setting.type === "enum" ? (
        <EnumField setting={setting} />
      ) : (
        <Input
          label={setting.label}
          name={setting.key}
          defaultValue={setting.value}
          type={setting.type === "number" ? "number" : "text"}
          // Secret fields must never be recalled by the browser's password
          // manager — the value shown is a placeholder, not the real secret.
          autoComplete={setting.isSecret ? "off" : undefined}
          placeholder={
            setting.isSecret && !setting.hasValue ? "Not set" : undefined
          }
          inputClassName="w-full"
          dir="ltr"
        />
      )}
      {setting.description ? (
        <p className="mt-1 text-sm text-gray-500">{setting.description}</p>
      ) : null}
    </div>
  );
}

/**
 * A toggle backed by a hidden input.
 *
 * An unchecked HTML checkbox submits nothing, which the action would read as
 * "cleared" rather than "false". Mirroring the state into a hidden field makes
 * both positions submit an explicit value.
 */
function BooleanField({ setting }: { setting: AdminSettingView }) {
  const [checked, setChecked] = useState(setting.value === "true");

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name={setting.key} value={String(checked)} />
      <Switch
        checked={checked}
        onCheckedChange={setChecked}
        id={`switch-${setting.key}`}
      />
      <label htmlFor={`switch-${setting.key}`} className="font-medium">
        {setting.label}
      </label>
    </div>
  );
}

/** A native select for enum settings — few options, no search needed. */
function EnumField({ setting }: { setting: AdminSettingView }) {
  return (
    <div>
      <label htmlFor={setting.key} className="mb-1 block font-medium">
        {setting.label}
      </label>
      <select
        id={setting.key}
        name={setting.key}
        defaultValue={setting.value}
        className="w-full rounded border border-gray-300 px-3 py-2"
      >
        {setting.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
