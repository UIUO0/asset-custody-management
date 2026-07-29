/// <reference types="vitest" />
/// <reference types="vite/client" />

import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./test/setup-test-env.ts"],
    // Include both standard test files and .test.server.ts route tests.
    // The `.server` infix avoids React Router typegen collisions (the typegen
    // mirrors route filenames under .react-router/types, so a plain
    // `foo.test.ts` would produce a generated file with the same name that
    // Vitest would otherwise try to run as a second test file).
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "**/*.test.server.[jt]s"],
    includeSource: ["app/**/*.{js,ts}"],
    exclude: [
      "node_modules",
      "mocks/**/*.{js,ts}",
      "test/e2e/**/*",
      "test/setup-test-env.ts",
      // React Router's typegen mirrors route filenames under .react-router/types,
      // so a route test at `foo.test.ts` produces a generated file with the same
      // name that vitest would otherwise try to run as a test.
      ".react-router/**",
      // Moved to `test/routes-tests/api+/user.entity-counts.test.ts`. Living
      // inside the routes directory made the dev server emit a
      // "Server-only module referenced by client" pre-transform warning on
      // every start, because remix-flat-routes treats the file as a route.
      // TODO: delete the now-empty `app/routes/api+/user.entity-counts.test.ts`
      // and drop this exclude line with it.
      "app/routes/api+/user.entity-counts.test.ts",
    ],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["app/**/*.{js,ts}"],
      all: true,
    },
  },
} as UserConfig);
