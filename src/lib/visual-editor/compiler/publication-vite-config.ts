import type { VisualProjectKind } from "../project-document";

/** Build configuration for the compiler-owned copy of the official template. */
export function generatePublicationViteConfig(kind: VisualProjectKind): string {
  const component = kind === "world" ? "World" : "Item";
  return `import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import federation from '@originjs/vite-plugin-federation'

// XRift serves each publication from a single directory. Scoped packages and
// package subpaths otherwise become directories in federation chunk names.
// Studio ships fallback packages too: the SDK reserves __federation_shared_*
// for host-only packages and excludes those names even without custom ignores.
const flatChunkFileName = (chunk: { name: string }) =>
  chunk.name.replace(/^__federation_shared_/, 'xrift-studio-shared-').replace(/[\\\\/]/g, '_') + '-[hash].js'

export default defineConfig({
  // Modules and Vite's preload requests must stay under this publication URL.
  base: './',
  plugins: [
    react(),
    dts({ insertTypesEntry: true }),
    federation({
      name: 'xrift_studio_project',
      filename: 'remoteEntry.js',
      exposes: { './${component}': './src/index.tsx' },
      shared: {
        react: { requiredVersion: '*' },
        'react-dom': { requiredVersion: '*' },
        'react-dom/client': {},
        'react/jsx-runtime': {},
        three: { requiredVersion: '*' },
        'three/addons/loaders/GLTFLoader.js': {},
        'three/addons/loaders/DRACOLoader.js': {},
        'three/addons/loaders/KTX2Loader.js': {},
        '@react-three/fiber': { requiredVersion: '*' },
        '@react-three/rapier': { requiredVersion: '*' },
        '@react-three/drei': { requiredVersion: '*' },
        '@react-three/uikit': { requiredVersion: '*' },
        '@pmndrs/uikit': { requiredVersion: '*' },
        '@xrift/world-components': { requiredVersion: '*' },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    assetsDir: '',
    rollupOptions: {
      output: {
        entryFileNames: flatChunkFileName,
        chunkFileNames: flatChunkFileName,
      },
    },
  },
  resolve: { alias: { '~': path.resolve(__dirname, './src') } },
  define: { global: 'globalThis' },
})
`;
}
