import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "preview-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./preview.html", import.meta.url)),
    },
  },
});
