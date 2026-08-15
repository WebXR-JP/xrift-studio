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
        wiki: fileURLToPath(new URL("./wiki.html", import.meta.url)),
      },
    },
  },
});
