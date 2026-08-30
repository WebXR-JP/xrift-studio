import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { env } from "node:process";
import { localThreeVendorAssets } from "./scripts/vite-local-three-vendor";
import { localTextFontAssets } from "./scripts/vite-local-text-fonts";

const host = env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), localThreeVendorAssets(), localTextFontAssets()],
  // three-icosa publishes a valid ESM `module` entry but no Node-style `main`.
  // Serving that module directly avoids a missing optimized dependency when
  // the lazily loaded Visual Editor first enables Open Brush rendering.
  optimizeDeps: {
    // The Visual Editor and Play compiler are loaded lazily. Include both in
    // the initial pass so first Play never triggers a dependency re-optimization
    // and full page reload in the middle of Script preparation.
    include: [
      "@xrift/world-components",
      "monaco-editor/esm/vs/language/typescript/lib/typescriptServices.js",
    ],
    exclude: ["three-icosa"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
