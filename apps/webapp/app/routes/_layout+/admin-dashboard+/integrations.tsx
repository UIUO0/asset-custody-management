/**
 * `/admin-dashboard/integrations` — API keys for external systems.
 *
 * Issue a key, see what exists, revoke what should not. The token is displayed
 * exactly once, immediately after creation: only its SHA-256 digest is stored,
 * so there is no "show key again" and no way to add one.
 *
 * ## Visibility
 *
 * Same three gates as the settings page: the parent layout's `requireAdmin`,
 * this route's own `requireAdmin` on both loader and action (child routes are
 * fetched directly on client navigation, so the parent gate alone is not
 * enough), and the sidebar hiding `/admin-dashboard` unless `isAdmin`.
 *
 * A workspace owner cannot reach this page. An API key acts without a session
 * and without the role checks that constrain a signed-in person, so issuing one
 * is an instance-level decision rather than a workspace one.
 *
 * Not translated, matching every other page in `admin-dashboard+`.
 *
 * @see {@link file://./../../../modules/api-key/service.server.ts}
 * @see {@link file://./../../api+/admin.api-keys.ts} the scripted equivalent
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
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import { Table, Td, Th, Tr } from "~/components/table";
import {
  API_KEY_SCOPES,
  API_KEY_SCOPE_LABELS,
  type ApiKeyScope,
} from "~/modules/api-key/scopes";
import {
  createApiKey,
  getOrganizationsForApiKeyForm,
  listApiKeys,
  revokeApiKey,
} from "~/modules/api-key/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error, parseData } from "~/utils/http.server";
import { requireAdmin } from "~/utils/roles.server";

export const meta = () => [{ title: appendToMetaTitle("Integrations") }];

const CreateSchema = z.object({
  intent: z.literal("create"),
  name: z.string().trim().min(1, "Name is required").max(120),
  organizationId: z.string().min(1, "Workspace is required"),
  // `parseFormAny` collapses a single checkbox to a string and several to an
  // array, so accept both shapes and normalize to a list.
  scopes: z.union([z.string(), z.array(z.string())]).optional(),
  /** `<input type="date">` value, or empty for a key that never expires. */
  expiresAt: z.string().optional(),
});

const RevokeSchema = z.object({
  intent: z.literal("revoke"),
  id: z.string().min(1),
});

export async function loader({ context }: LoaderFunctionArgs) {
  const { userId } = context.getSession();

  try {
    // Repeated deliberately — see the "Visibility" note in this module's header.
    await requireAdmin(userId);

    const [apiKeys, organizations] = await Promise.all([
      listApiKeys(),
      getOrganizationsForApiKeyForm(),
    ]);

    return payload({ apiKeys, organizations });
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
    const intent = formData.get("intent");

    if (intent === "revoke") {
      const { id } = parseData(formData, RevokeSchema);
      await revokeApiKey({ id });
      return payload({ revoked: true });
    }

    const body = parseData(formData, CreateSchema);

    const scopes =
      body.scopes === undefined
        ? []
        : Array.isArray(body.scopes)
        ? body.scopes
        : [body.scopes];

    const created = await createApiKey({
      name: body.name,
      organizationId: body.organizationId,
      scopes,
      userId,
      // A date input gives a local calendar day; treat it as end-of-day so a
      // key set to expire "on the 30th" works through the 30th.
      expiresAt: body.expiresAt ? new Date(`${body.expiresAt}T23:59:59`) : null,
    });

    // The only moment `token` exists outside the caller's own record of it.
    return payload({ createdToken: created.token, createdName: created.name });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    return data(error(reason), { status: reason.status });
  }
}

export default function IntegrationsPage() {
  const { apiKeys, organizations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  const createdToken =
    actionData && "createdToken" in actionData ? actionData.createdToken : null;
  const errorMessage =
    actionData && "error" in actionData ? actionData.error?.message : null;

  return (
    <div className="mb-10">
      <div className="mb-6">
        <h2>Integrations</h2>
        <p className="text-gray-600">
          API keys let an external system read and update data through{" "}
          <code>/api/v1</code>. Each key is bound to one workspace and to the
          scopes selected below.
        </p>
      </div>

      {errorMessage ? (
        <div className="mb-6 rounded border border-error-300 bg-error-50 p-4 text-error-700">
          {errorMessage}
        </div>
      ) : null}

      {createdToken ? <NewTokenPanel token={createdToken} /> : null}

      <section className="mb-10 rounded border border-gray-200 p-6">
        <h3 className="mb-4">Issue a new key</h3>

        <Form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="intent" value="create" />

          <Input
            label="Name"
            name="name"
            required
            placeholder="e.g. ERP nightly sync"
            inputClassName="w-full"
          />

          <div>
            <label htmlFor="organizationId" className="mb-1 block font-medium">
              Workspace
            </label>
            <select
              id="organizationId"
              name="organizationId"
              required
              className="w-full rounded border border-gray-300 px-3 py-2"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              The key can only ever read or change data in this workspace.
            </p>
          </div>

          <fieldset>
            <legend className="mb-2 font-medium">Scopes</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {API_KEY_SCOPES.map((scope) => (
                <label
                  key={scope}
                  htmlFor={`scope-${scope}`}
                  className="flex items-center gap-2"
                >
                  <input
                    id={`scope-${scope}`}
                    type="checkbox"
                    name="scopes"
                    value={scope}
                  />
                  <span>{API_KEY_SCOPE_LABELS[scope as ApiKeyScope]}</span>
                  <code className="text-xs text-gray-500">{scope}</code>
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Grant only what the integration needs. A key with no write scope
              cannot change anything, whatever it sends.
            </p>
          </fieldset>

          <Input
            label="Expires on (optional)"
            name="expiresAt"
            type="date"
            inputClassName="w-full"
          />

          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Working..." : "Create key"}
            </Button>
          </div>
        </Form>
      </section>

      <section>
        <h3 className="mb-4">Existing keys</h3>

        {apiKeys.length === 0 ? (
          <p className="text-gray-600">No API keys have been issued yet.</p>
        ) : (
          <Table>
            <thead>
              <Tr className="text-start">
                <Th>Name</Th>
                <Th>Prefix</Th>
                <Th>Workspace</Th>
                <Th>Scopes</Th>
                <Th>Status</Th>
                <Th>Last used</Th>
                <Th>Expires</Th>
                <Th>Issued by</Th>
                <Th />
              </Tr>
            </thead>
            <tbody>
              {apiKeys.map((key) => (
                <Tr key={key.id}>
                  <Td>{key.name}</Td>
                  <Td>
                    <code className="text-xs">{key.prefix}…</code>
                  </Td>
                  <Td>{key.organizationName}</Td>
                  <Td>
                    <span className="text-xs text-gray-600">
                      {key.scopes.join(", ")}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={key.status} />
                  </Td>
                  <Td>
                    {key.lastUsedAt ? (
                      <DateS date={key.lastUsedAt} includeTime />
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </Td>
                  <Td>
                    {key.expiresAt ? (
                      <DateS date={key.expiresAt} />
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-xs text-gray-600">
                      {key.createdByEmail ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    {key.status === "revoked" ? null : (
                      <Form method="post">
                        <input type="hidden" name="intent" value="revoke" />
                        <input type="hidden" name="id" value={key.id} />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                        >
                          Revoke
                        </Button>
                      </Form>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

/**
 * The one-time token reveal.
 *
 * Deliberately loud: once this panel is dismissed by navigating away, the token
 * cannot be recovered from anywhere — a lost key is replaced, not looked up.
 *
 * @param props.token - The freshly issued token
 */
function NewTokenPanel({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mb-8 rounded border border-warning-300 bg-warning-50 p-5">
      <h3 className="mb-2">Copy this key now</h3>
      <p className="mb-3 text-sm">
        This is the only time the key is shown. It is stored as a hash, so it
        cannot be retrieved again — if it is lost, revoke it and issue a new
        one.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <code
          className="break-all rounded bg-white px-3 py-2 text-sm"
          dir="ltr"
        >
          {token}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(token).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-3 text-sm text-gray-700">
        Send it as <code>Authorization: Bearer &lt;key&gt;</code> or{" "}
        <code>x-api-key: &lt;key&gt;</code>.
      </p>
    </div>
  );
}

/** Colour-coded key status. */
function StatusBadge({ status }: { status: "active" | "revoked" | "expired" }) {
  const styles = {
    active: "bg-success-50 text-success-700 border-success-300",
    revoked: "bg-error-50 text-error-700 border-error-300",
    expired: "bg-gray-100 text-gray-700 border-gray-300",
  } as const;

  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${styles[status]}`}>
      {status}
    </span>
  );
}
