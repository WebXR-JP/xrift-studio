import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: "preview-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        preview: fileURLToPath(new URL("./preview.html", import.meta.url)),
        // Authored at its published depth on purpose. The build emits relative
        // "./assets/..." references, so the entry has to sit where it will be
        // served from; building it at the root and moving it afterwards points
        // every script and stylesheet one directory too deep and the guide
        // serves a blank page. scripts/check-published-guide-assets.mjs fails
        // the build if those references stop resolving.
        wiki: fileURLToPath(new URL("./wiki/index.html", import.meta.url)),
      },
    },
  },
});
