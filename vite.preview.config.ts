import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { staticGuide } from "./scripts/vite-guide.mjs";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), staticGuide({ publish: true })],
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
        // The guide is emitted as static HTML by staticGuide, without the app bundle.
      },
    },
  },
});
