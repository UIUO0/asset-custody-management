import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { vi } from "vitest";

/**
 * Common Remix hook mocks for testing components that use Remix hooks.
 * These are reusable mocks that can be imported across test files.
 */

/** User id every route test authenticates as unless it supplies its own context. */
export const MOCK_SESSION_USER_ID = "user-123";

/**
 * Default `context` for route args.
 *
 * The real server (`server/index.ts`) hands every loader and action a context
 * exposing `getSession()`, and protected routes call it before anything else.
 * Defaulting to `{}` meant any test that did not hand-roll a context failed with
 * `context.getSession is not a function` — an error about the harness, not about
 * the route. Supplying the real shape here keeps that noise out of the tests.
 *
 * Override by passing `context` explicitly when a test needs a different user.
 */
function createMockContext(): LoaderFunctionArgs["context"] {
  return {
    isAuthenticated: true,
    appVersion: "test",
    getSession: () => ({ userId: MOCK_SESSION_USER_ID }),
  } as unknown as LoaderFunctionArgs["context"];
}

// why: provides proper type-safe args for testing loaders with all required React Router 7
// properties. `pattern` and `url` were briefly renamed to `unstable_*` in early 7.16, then
// stabilized back to plain `pattern` / `url` in a later 7.16 patch (which is what's
// resolved by the current lockfile and what CI runs against).
export function createLoaderArgs(
  args: Partial<LoaderFunctionArgs>,
): LoaderFunctionArgs {
  const request = args.request || new Request("http://localhost:3000");
  return {
    request,
    params: args.params || {},
    context: args.context || createMockContext(),
    pattern: args.pattern ?? "*",
    url: args.url ?? new URL(request.url),
  };
}

// why: same as `createLoaderArgs` — `pattern` / `url` stabilized in 7.16's later patch.
export function createActionArgs(
  args: Partial<ActionFunctionArgs>,
): ActionFunctionArgs {
  const request =
    args.request || new Request("http://localhost:3000", { method: "POST" });
  return {
    request,
    params: args.params || {},
    context: args.context || createMockContext(),
    pattern: args.pattern ?? "*",
    url: args.url ?? new URL(request.url),
  };
}

// why: allows testing components that read loader data without running actual loaders
export const createUseLoaderDataMock = () => vi.fn();

// why: allows testing components that use navigation without triggering actual navigation
export const createUseNavigateMock = () => vi.fn();

// why: allows testing form submissions without actual server actions
export const createUseActionDataMock = () => vi.fn();

// why: allows testing components that read fetch results
export const createUseFetcherMock = () => ({
  submit: vi.fn(),
  load: vi.fn(),
  data: undefined,
  state: "idle" as const,
  formData: undefined,
});

// why: allows testing components that read search params without URL manipulation
export const createUseSearchParamsMock = () => {
  const searchParams = new URLSearchParams();
  const setSearchParams = vi.fn();
  return [searchParams, setSearchParams] as const;
};

/**
 * Complete Remix mock setup for components that need multiple hooks
 */
export const createRemixMocks = () => ({
  useLoaderData: createUseLoaderDataMock(),
  useActionData: createUseActionDataMock(),
  useNavigate: createUseNavigateMock(),
  useFetcher: createUseFetcherMock(),
  useSearchParams: createUseSearchParamsMock(),
  Link: ({ to, children, ...rest }: any) => (
    <a {...rest} href={typeof to === "string" ? to : undefined}>
      {children}
    </a>
  ),
});
