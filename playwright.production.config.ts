import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = process.env.XRIFT_PRODUCTION_E2E_PORT ?? "1461";
const url = `http://localhost:${port}`;
export default defineConfig({
  ...base,
  outputDir: "test-results-production",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-production" }]],
  testMatch: "uikit-production.spec.ts",
  use: { ...base.use, baseURL: url },
  webServer: {
    command: `node scripts/build-production-e2e.mjs && pnpm exec vite preview --host localhost --port ${port} --strictPort --outDir node_modules/.cache/e2e-production`,
    url: `${url}/e2e.html?scenario=ready`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
