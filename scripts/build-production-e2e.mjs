import { build } from 'vite';

// The same config, plugins and minifier as the distributed desktop app.
await build({ mode: 'e2e', build: { outDir: 'node_modules/.cache/e2e-production', rolldownOptions: { input: 'e2e.html' } } });
