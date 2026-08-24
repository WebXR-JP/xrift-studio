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
        // Authored at its published depth on purpose. The guide used to be
        // built as wiki.html and moved into wiki/ afterwards, which left its
        // relative "./assets/..." references pointing one directory too deep:
        // every script and stylesheet 404'd and the guide served a blank page.
        wiki: fileURLToPath(new URL("./wiki/index.html", import.meta.url)),
      },
    },
  },
});
