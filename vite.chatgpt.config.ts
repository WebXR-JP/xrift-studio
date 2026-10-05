import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// Private Sites assets cannot be loaded anonymously from ChatGPT's sandbox.
// Deliver the app's code and styles in the authenticated MCP HTML resource.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_STUDIO_MEDIA': JSON.stringify(Object.fromEntries(
      ['visual-editor-screenshot.webp', 'editor-ai-panel.webp'].map(name => [name, `data:image/webp;base64,${readFileSync(`public/${name}`).toString('base64')}`]),
    )),
  },
  build: {
    outDir: 'chatgpt-dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'chatgpt.html',
      output: { inlineDynamicImports: true },
    },
  },
});
