import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
// A dedicated port keeps a full audit independent of a running Tauri session.
const port = process.env.XRIFT_E2E_PORT ?? "1420";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // 全件を手動でshard分割するときは、テスト単位で振り分ける。
  // リリース時は主要導線だけを1 workerで実行する。
  fullyParallel: true,
  workers: 1,
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  // The first Visual Editor load compiles the editor and initializes its WebGL
  // scene. Release runners without hardware acceleration can spend well over a
  // minute there before the actual interaction starts, so keep this above the
  // cold-start budget instead of turning a slow runner into a false failure.
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  reporter: isCI
    ? [
        ["line"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-angle=swiftshader"],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --host localhost --port ${port} --mode e2e`,
    url: `${baseURL}/e2e.html?scenario=ready`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
