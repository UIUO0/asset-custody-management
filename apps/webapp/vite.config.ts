import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { createRequire } from "module";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { reactRouterHonoServer } from "react-router-hono-server/dev";
import { cjsInterop } from "vite-plugin-cjs-interop";
import { init } from "@paralleldrive/cuid2";

const require = createRequire(import.meta.url);

const createHash = init({
  length: 8,
});

const buildHash = process.env.BUILD_HASH || createHash();

// Resolve the generated Prisma browser entry that contains enum runtime values.
// In pnpm, .prisma/client lives inside the @prisma/client store directory,
// not at the project root, so we resolve the path dynamically.
const prismaClientDir = dirname(require.resolve("@prisma/client/package.json"));
const prismaClientIndexBrowser = resolve(
  prismaClientDir,
  "../../.prisma/client/index-browser.js",
);

// Fail fast if the Prisma browser bundle is missing. Without it, enums like
// OrganizationRoles silently resolve to `undefined` in the browser at runtime.
if (!existsSync(prismaClientIndexBrowser)) {
  throw new Error(
    `Prisma browser bundle not found at ${prismaClientIndexBrowser}. ` +
      `Run "prisma generate" or check that the .prisma/client path is correct.`,
  );
}

// Use HTTPS when cert files are present (mkcert / local dev).
// Skip HTTPS with DISABLE_HTTPS=true (e.g. mobile companion testing over LAN).
const certKeyPath = resolve(__dirname, ".cert/key.pem");
const certPath = resolve(__dirname, ".cert/cert.pem");
const httpsConfig =
  process.env.DISABLE_HTTPS !== "true" &&
  existsSync(certKeyPath) &&
  existsSync(certPath)
    ? { key: certKeyPath, cert: certPath }
    : undefined;

export default defineConfig({
  envDir: "../..",
  ssr: {
    noExternal: ["@shelf/database", "@shelf/labels"],
  },
  server: {
    port: 3000,
    https: httpsConfig,
    /**
     * Poll the filesystem instead of relying on OS change notifications.
     *
     * Vite's default watcher uses native events (ReadDirectoryChangesW on
     * Windows, inotify on Linux). Those never fire when the file is written
     * through a layer that does not raise them — a mounted volume, a network
     * share, a container bind mount, or an editor/agent writing from outside
     * the host filesystem. The symptom is brutal to diagnose because nothing
     * errors: the file on disk is demonstrably correct, and the dev server
     * keeps serving the copy it loaded at boot until it is restarted.
     *
     * Polling costs a little idle CPU and trades it for a watcher that cannot
     * silently miss a write. Dev-only — `server` config is ignored in builds.
     */
    watch: {
      usePolling: true,
      interval: 300,
    },
    warmup: {
      clientFiles: [
        "./app/entry.client.tsx",
        "./app/root.tsx",
        "./app/routes/**/*.tsx",
        "./app/routes/**/*.ts",
        "!./app/routes/**/*.test.server.ts",
      ],
    },
  },

  build: {
    target: "ES2022",
    assetsDir: `file-assets`,
    rollupOptions: {
      output: {
        entryFileNames: `file-assets/${buildHash}/[name]-[hash].js`,
        chunkFileNames() {
          return `file-assets/${buildHash}/[name]-[hash].js`;
        },
        assetFileNames() {
          return `file-assets/${buildHash}/[name][extname]`;
        },
      },
    },
  },
  resolve: {
    alias: {
      ".prisma/client/index-browser": prismaClientIndexBrowser,
      // Use lottie_light version to avoid eval warnings
      "lottie-web": "lottie-web/build/player/lottie_light.js",
    },
  },
  plugins: [
    cjsInterop({
      // List of CJS dependencies that require interop
      dependencies: ["react-microsoft-clarity", "@markdoc/markdoc"],
    }),
    reactRouterHonoServer({
      serverEntryPoint: "./server/index.ts",
    }),
    reactRouter(),
    tsconfigPaths(),
  ],
});
