import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    /**
     * Re-seed automatically after `prisma migrate reset` (`pnpm db:reset`).
     *
     * ⚠️ This is not a convenience — it closes a trap that cost two debugging
     * sessions. Accounts live in TWO schemas: `auth.users` (Supabase) and
     * `public."User"` (Prisma). A reset wipes only `public`, so every account
     * still exists in auth while none exists in the app. The browser session
     * stays valid, points at a `User` row that is gone, and EVERY
     * authenticated page renders "User not found" — a message that blames the
     * user or their permissions and says nothing about the real cause.
     *
     * Without this hook `db:reset` always left the app in that state and the
     * next person had to know to run `webapp:seed:org` by hand.
     *
     * `pnpm --filter` is used rather than a relative `tsx` path so the seed
     * runs with `apps/webapp` as its cwd — its own script resolves `../../.env`
     * from there.
     *
     * @see apps/webapp/scripts/seed-demo-users.ts — `ensureAuthAccount` looks
     *   existing accounts up in `auth.users`, which is what makes re-seeding
     *   onto a wiped `public` schema work at all.
     */
    seed: "pnpm --filter @shelf/webapp seed:org",
  },
});
