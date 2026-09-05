import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // 1 worker のままなので、同じ実行で 2 つのテストが並ぶことはない。
  // fullyParallel はテストの分割単位だけを変える。false のままだと 1 ファイルが
  // 分割できない 1 塊になり、14 個のテストを持つ release-gate.spec.ts が
  // Release workflow の --shard 分割を丸ごと 1 台に寄せてしまう。
  fullyParallel: true,
  workers: 1,
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  timeout: 60_000,
  expect: {
    timeout: 12_000,
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
    baseURL: "http://localhost:1420",
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
    command: "pnpm dev -- --host localhost --port 1420",
    url: "http://localhost:1420/e2e.html?scenario=ready",
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
