import { defineConfig } from "vite";
import { builtinModules } from "node:module";
import path from "node:path";

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

export default defineConfig({
  build: {
    target: "node20",
    outDir: "dist/cli",
    emptyOutDir: true,
    minify: false,
    ssr: true,
    rollupOptions: {
      input: {
        "xrift-studio": path.resolve("cli/main.mjs"),
        fixture: path.resolve("cli/convert.fixture.mjs"),
      },
      external: (id) => nodeBuiltins.has(id),
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
        banner: "#!/usr/bin/env node",
      },
    },
  },
});
