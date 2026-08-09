import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { getSession } from "remix-hono/session";
import { getClientIp } from "./client-ip";
import { authSessionKey } from "./session";
import type { FlashData, SessionData } from "./session";

/**
 * Per-(user, path) rate limit for single-fetch `.data` loader revalidations.
 *
 * React Router's single-fetch data requests (`*.data`) are issued on every
 * revalidation. A buggy client — e.g. a tab stuck in a revalidation loop — can
 * fire these unbounded, and each one opens a DB connection; a single runaway
 * tab is enough to exhaust the Prisma connection pool and take down the app
 * (this guard exists because that happened in production).
 *
 * The bucket key is `(userId | clientIP, path)`:
 * - Keying by `userId` (falling back to client IP for unauthenticated/edge
 *   cases) isolates one user's loop from everyone else.
 * - Keying by `c.req.path` (which excludes the query string — intentional)
 *   means a loop hammering ONE path is capped, while normal navigation across
 *   many varied paths is never throttled. Same-path/different-query
 *   revalidations deliberately share a bucket.
 *
 * Backed by an in-memory MemoryStore, so counters are per-machine: with N Fly
 * machines the effective ceiling is ~`limit`×N/min worst-case. That's an
 * accepted trade-off (a deliberate trade-off); a Cloudflare edge
 * rule is the eventual hard, cross-machine ceiling. `limit` is the tuning knob
 * — raise it if legitimate high-frequency revalidation is misfiring, lower it
 * to clamp down harder.
 *
 * @param limit - Max `.data` requests per (user, path) per 60s window.
 *   Defaults to 60. Exposed primarily so tests can drive a low, deterministic
 *   threshold; production callers should rely on the default.
 */
export const appLoaderRateLimit = (limit = 60) =>
  rateLimiter({
    windowMs: 60_000,
    limit,
    standardHeaders: "draft-7",
    keyGenerator: (c) => {
      // `hono-rate-limiter` types the handler context with hono's default
      // `Env`, which is structurally narrower than the `Context<Env>` that
      // remix-hono's `getSession` expects; cast to bridge the two (the value
      // is a genuine hono Context, only the generic differs).
      const auth = getSession<SessionData, FlashData>(c as Context).get(
        authSessionKey,
      );
      const identity = auth?.userId ?? getClientIp(c);
      return `app:${identity}:${c.req.path}`;
    },
    handler: (c) =>
      c.json(
        {
          error: {
            message: "Too many requests. Please try again later.",
          },
        },
        429,
      ),
  });
