import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: { entry: 'packages/xrift-studio-cloud/worker.ts', formats: ['es'], fileName: () => 'index.js' },
    outDir: 'dist/server',
    target: 'es2022',
    rollupOptions: { output: { entryFileNames: 'index.js' } },
  },
});
