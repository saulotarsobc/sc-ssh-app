import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import electron from "vite-plugin-electron/simple";

/**
 * Keeps packages out of the main process bundle, resolved from node_modules
 * at runtime instead.
 *
 * This is a plugin rather than `build.rollupOptions.external` on purpose:
 * vite-plugin-electron reads `rolldownOptions` on Vite 8+ and
 * `rollupOptions` on earlier Vite, silently dropping whichever key does not
 * match the running version — the package would end up back inside the
 * bundle with no warning. A `resolveId` hook works either way.
 */
function externalize(...ids: string[]): Plugin {
  return {
    name: "sc-boilerplate:externalize",
    // "pre" is required: without it Vite's own resolver would already have
    // turned the specifier into a file path before this hook runs.
    enforce: "pre",
    resolveId: (source) =>
      ids.includes(source) ? { id: source, external: true } : undefined,
  };
}

export default defineConfig({
  build: {
    outDir: "dist/frontend",
    assetsDir: ".",
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: "backend/main.ts",
        vite: {
          // electron-updater has to ship as a production dependency, not
          // bundled: it loads the platform-specific updater with a dynamic
          // `require` and reads app-update.yml from resources/.
          // electron-builder copies production dependencies even with
          // `files` restricted to dist/**, so leaving it out here is enough.
          plugins: [externalize("electron-updater")],
          build: {
            outDir: "dist/backend",
          },
        },
      },
      preload: {
        input: path.join(__dirname, "backend/preload.ts"),
        vite: {
          build: {
            outDir: "dist/backend",
          },
        },
      },
      renderer: process.env.NODE_ENV === "test" ? undefined : {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
